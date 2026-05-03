package server

import (
	"errors"
	"log/slog"
	"net/http"
	"time"
)

func Run() error {
	config := LoadConfig()
	server := New(config)

	slog.Info("backend listening", "addr", config.Addr)
	err := server.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}

	return err
}

func New(config Config) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/", handleHello)
	mux.HandleFunc("/healthz", handleHealthz)

	return &http.Server{
		Addr:              config.Addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
}
