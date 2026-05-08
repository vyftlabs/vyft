package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/vyftlabs/vyft/apps/backend/internal/deployments"
	"github.com/vyftlabs/vyft/apps/backend/internal/observability"
	"github.com/vyftlabs/vyft/apps/backend/internal/projects"
	"github.com/vyftlabs/vyft/apps/backend/internal/registries"
	"github.com/vyftlabs/vyft/apps/backend/internal/resources"
	"github.com/vyftlabs/vyft/apps/backend/internal/routes"
	"github.com/vyftlabs/vyft/apps/backend/internal/variables"
)

func Run(ctx context.Context) error {
	config := LoadConfig()
	server := New(config)

	slog.Info("backend listening", "addr", config.Addr, "basic_auth", config.BasicAuthPass != "")
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

	api := http.NewServeMux()
	projects.Register(api)
	resources.Register(api)
	variables.Register(api)
	routes.Register(api)
	registries.Register(api)
	deployments.Register(api)
	observability.Register(api)
	mux.Handle("/api/", http.StripPrefix("/api", api))

	mux.Handle("/", newStaticHandler())

	handler := basicAuth(config.BasicAuthUser, config.BasicAuthPass, mux)

	return &http.Server{
		Addr:              config.Addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
}
