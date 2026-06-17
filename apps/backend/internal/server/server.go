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
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
	"github.com/vyftlabs/vyft/apps/backend/internal/environment"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/httpx"
	k8srt "github.com/vyftlabs/vyft/apps/backend/internal/runtime/k8s"
	"github.com/vyftlabs/vyft/apps/backend/internal/source/crud"
	"github.com/vyftlabs/vyft/apps/backend/internal/status"
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

	database := vdb.New(pool)
	provDir := crud.ResolveProvisioningDir()
	slog.Info("syncing provisioning", "dir", provDir)
	if err := crud.SyncProvisioning(ctx, database, provDir); err != nil {
		return fmt.Errorf("sync provisioning: %w", err)
	}

	rt, cs, mcs, hooks := buildRuntime(config, pool)

	// Live status watcher: one set of cluster watches feeds every SSE
	// subscriber. Tied to ctx so its watches stop on shutdown.
	watcher := status.NewWatcher(cs)
	watcher.Start(ctx)

	server, depSvc := New(config, pool, rt, cs, mcs, hooks, watcher)

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

func New(config Config, pool *pgxpool.Pool, rt deployment.Runtime, cs kubernetes.Interface, mcs metricsclient.Interface, hooks ClusterHooks, watcher *status.Watcher) (*http.Server, *deployment.Service) {
	database := vdb.New(pool)

	api, depSvc := NewAPI(database, rt, cs, mcs, hooks)
	strict := openapi.NewStrictHandler(api, nil)
	apiHandler := openapi.HandlerWithOptions(strict, openapi.StdHTTPServerOptions{
		ErrorHandlerFunc: writeError,
	})

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", handleHealthz)
	// SSE status stream is mounted raw (not via the generated handler, which
	// can't stream). The specific pattern wins over the "/api/" catch-all.
	if watcher != nil {
		mux.Handle("GET /api/sse/projects/{projectId}/status", statusSSEHandler(database, watcher))
	}
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
// Also returns the kube clientset (needed by the kube-logs source), the
// metrics-server client (may be nil), and the cluster hooks used by non-
// deploy paths.
func buildRuntime(cfg Config, pool *pgxpool.Pool) (deployment.Runtime, kubernetes.Interface, metricsclient.Interface, ClusterHooks) {
	restCfg, err := loadKubeConfig(cfg.KubeconfigPath)
	if err != nil {
		slog.Warn("k8s runtime unavailable, falling back to stub", "error", err)
		return deployment.NewStubRuntime(), nil, nil, ClusterHooks{}
	}
	cs, err := kubernetes.NewForConfig(restCfg)
	if err != nil {
		slog.Warn("kubernetes client init failed, falling back to stub", "error", err)
		return deployment.NewStubRuntime(), nil, nil, ClusterHooks{}
	}
	dyn, err := dynamic.NewForConfig(restCfg)
	if err != nil {
		slog.Warn("dynamic client init failed, falling back to stub", "error", err)
		return deployment.NewStubRuntime(), nil, nil, ClusterHooks{}
	}
	mcs, err := metricsclient.NewForConfig(restCfg)
	if err != nil {
		slog.Warn("metrics client init failed; metrics-server source kind unavailable", "error", err)
		mcs = nil
	}
	rt := k8srt.New(cs, dyn)
	hooks := buildClusterHooks(cs, pool)
	return rt, cs, mcs, hooks
}

// buildClusterHooks wires every non-deploy path that reaches into the cluster.
// All hooks are best-effort: errors logged, not returned to the caller.
func buildClusterHooks(cs kubernetes.Interface, pool *pgxpool.Pool) ClusterHooks {
	database := vdb.New(pool)
	return ClusterHooks{
		ProjectCleanup: func(ctx context.Context, slug string) {
			if err := k8srt.DeleteProjectNamespaces(ctx, cs, slug); err != nil {
				slog.Warn("project ns cleanup failed", "slug", slug, "error", err)
			}
		},
		ProjectEnsure: func(ctx context.Context, p sqlc.Project) {
			project := deployment.ProjectFromRow(p)
			ns := k8srt.NamespaceFor(project.Slug, environment.DefaultSlug)
			if err := k8srt.EnsureNamespace(ctx, cs, ns, project, environment.DefaultSlug); err != nil {
				slog.Warn("project ensure namespace failed", "slug", project.Slug, "error", err)
				return
			}
			regs, err := database.Q.ListRegistries(ctx)
			if err != nil {
				slog.Warn("project ensure: list registries", "slug", project.Slug, "error", err)
				return
			}
			for _, r := range regs {
				if err := k8srt.ApplyRegistrySecret(ctx, cs, ns, project, deployment.RegistryFromRow(r)); err != nil {
					slog.Warn("project ensure: apply registry secret", "slug", project.Slug, "registry", r.Name, "error", err)
				}
			}
		},
		RegistrySync: func(ctx context.Context, r sqlc.Registry) {
			reg := deployment.RegistryFromRow(r)
			nss, err := k8srt.ListProjectNamespaces(ctx, cs)
			if err != nil {
				slog.Warn("registry sync: list project namespaces", "registry", r.Name, "error", err)
				return
			}
			for _, pn := range nss {
				if err := k8srt.ApplyRegistrySecret(ctx, cs, pn.Namespace, deployment.Project{Slug: pn.Slug}, reg); err != nil {
					slog.Warn("registry sync: apply secret", "namespace", pn.Namespace, "registry", r.Name, "error", err)
				}
			}
		},
		RegistryDelete: func(ctx context.Context, registryName string) {
			nss, err := k8srt.ListProjectNamespaces(ctx, cs)
			if err != nil {
				slog.Warn("registry delete: list project namespaces", "registry", registryName, "error", err)
				return
			}
			for _, pn := range nss {
				if err := k8srt.DeleteRegistrySecretInNamespace(ctx, cs, pn.Namespace, registryName); err != nil {
					slog.Warn("registry delete: drop secret", "namespace", pn.Namespace, "registry", registryName, "error", err)
				}
			}
		},
	}
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
