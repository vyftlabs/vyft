package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	vdb "github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/httpx"
	"github.com/vyftlabs/vyft/apps/backend/internal/web"
)

func Run(ctx context.Context) error {
	config := LoadConfig()

	pool, err := pgxpool.New(ctx, config.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect db: %w", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping db: %w", err)
	}

	slog.Info("running migrations")
	if err := vdb.Migrate(ctx, pool); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	server := New(config, pool)

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

func New(config Config, pool *pgxpool.Pool) *http.Server {
	database := vdb.New(pool)

	api := NewAPI(database)
	strict := openapi.NewStrictHandler(api, nil)
	apiHandler := openapi.HandlerWithOptions(strict, openapi.StdHTTPServerOptions{
		ErrorHandlerFunc: writeError,
	})

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", handleHealthz)
	mux.Handle("/api/", http.StripPrefix("/api", apiHandler))
	mux.Handle("/", web.NewStaticHandler())

	handler := basicAuth(config.BasicAuthUser, config.BasicAuthPass, mux)

	return &http.Server{
		Addr:              config.Addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
}

// writeError maps service/handler errors to the wire envelope. Anything that
// isn't already an *apierr.APIError becomes a 500 with the cause logged.
func writeError(w http.ResponseWriter, r *http.Request, err error) {
	var ae *apierr.APIError
	if !errors.As(err, &ae) {
		ae = apierr.Internal(err)
	}
	if ae.Status >= 500 {
		cause := errors.Unwrap(ae)
		if cause == nil {
			cause = ae
		}
		slog.ErrorContext(r.Context(), "handler error",
			"status", ae.Status, "code", ae.Code, "error", cause)
	}
	httpx.WriteJSON(w, ae.Status, ae)
}
