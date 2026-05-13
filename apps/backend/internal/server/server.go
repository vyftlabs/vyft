package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"

	vdb "github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/httpx"
	k8srt "github.com/vyftlabs/vyft/apps/backend/internal/runtime/k8s"
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

	rt, cs, mcs, projectClusterCleanup := buildRuntime(config)
	server, depSvc := New(config, pool, rt, cs, mcs, projectClusterCleanup)

	// Boot recovery: re-fire goroutines for any deployment row stuck in
	// pending/applying (process crashed mid-apply).
	if err := depSvc.RecoverActive(ctx); err != nil {
		slog.Warn("deployment: boot recovery failed", "error", err)
	}

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

// projectClusterCleanup deletes namespaces for a deleted project. nil = no-op
// (when no kube client is available). Wired in NewAPI so the project service
// can call it on Delete.
type projectClusterCleanup func(ctx context.Context, slug string)

func New(config Config, pool *pgxpool.Pool, rt deployment.Runtime, cs kubernetes.Interface, mcs metricsclient.Interface, cleanup projectClusterCleanup) (*http.Server, *deployment.Service) {
	database := vdb.New(pool)

	api, depSvc := NewAPI(database, rt, cs, mcs, cleanup)
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
	}, depSvc
}

// buildRuntime picks a Runtime based on config. KUBECONFIG path → use it.
// In-cluster config available → use that. Neither → StubRuntime (dev/test).
// Also returns the kube clientset (needed by the kube-logs source) and
// the metrics-server client; either may be nil if unavailable.
func buildRuntime(cfg Config) (deployment.Runtime, kubernetes.Interface, metricsclient.Interface, projectClusterCleanup) {
	restCfg, err := loadKubeConfig(cfg.KubeconfigPath)
	if err != nil {
		slog.Warn("k8s runtime unavailable, falling back to stub", "error", err)
		return deployment.NewStubRuntime(), nil, nil, nil
	}
	cs, err := kubernetes.NewForConfig(restCfg)
	if err != nil {
		slog.Warn("kubernetes client init failed, falling back to stub", "error", err)
		return deployment.NewStubRuntime(), nil, nil, nil
	}
	dyn, err := dynamic.NewForConfig(restCfg)
	if err != nil {
		slog.Warn("dynamic client init failed, falling back to stub", "error", err)
		return deployment.NewStubRuntime(), nil, nil, nil
	}
	mcs, err := metricsclient.NewForConfig(restCfg)
	if err != nil {
		slog.Warn("metrics client init failed; metrics-server source kind unavailable", "error", err)
		mcs = nil
	}
	rt := k8srt.New(cs, dyn)
	cleanup := func(ctx context.Context, slug string) {
		if err := k8srt.DeleteProjectNamespaces(ctx, cs, slug); err != nil {
			slog.Warn("project ns cleanup failed", "slug", slug, "error", err)
		}
	}
	return rt, cs, mcs, cleanup
}

func loadKubeConfig(path string) (*rest.Config, error) {
	if path != "" {
		return clientcmd.BuildConfigFromFlags("", path)
	}
	return rest.InClusterConfig()
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
