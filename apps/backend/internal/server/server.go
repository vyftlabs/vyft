package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"
)

func Run(ctx context.Context) error {
	config := LoadConfig()
	server := New(config)

	slog.Info("backend listening", "addr", config.Addr)
	errCh := make(chan error, 1)
	go func() {
		errCh <- server.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}

		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
		defer cancel()

		slog.Info("backend shutting down", "timeout", config.ShutdownTimeout)
		if err := server.Shutdown(shutdownCtx); err != nil {
			return err
		}

		err := <-errCh
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}

		return err
	}
}

func New(config Config) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", handleHealthz)
	mux.Handle("/", newStaticHandler())

	handler := basicAuth(config.BasicAuthUser, config.BasicAuthPass, mux)

	return &http.Server{
		Addr:              config.Addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
}
