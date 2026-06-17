package server

import (
	"context"

	"k8s.io/client-go/kubernetes"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"

	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
	"github.com/vyftlabs/vyft/apps/backend/internal/environment"
	"github.com/vyftlabs/vyft/apps/backend/internal/observability"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/project"
	"github.com/vyftlabs/vyft/apps/backend/internal/registry"
	"github.com/vyftlabs/vyft/apps/backend/internal/resource"
	"github.com/vyftlabs/vyft/apps/backend/internal/route"
	"github.com/vyftlabs/vyft/apps/backend/internal/source/crud"
	"github.com/vyftlabs/vyft/apps/backend/internal/source/resolver"
	"github.com/vyftlabs/vyft/apps/backend/internal/variable"
)

// Aliases rename embedded fields so multiple *Handler types don't collide on
// the unqualified field name "Handler". Method promotion is unaffected.
type (
	projectAPI       = project.Handler
	environmentAPI   = environment.Handler
	resourceAPI      = resource.Handler
	routeAPI         = route.Handler
	variableAPI      = variable.Handler
	registryAPI      = registry.Handler
	deploymentAPI    = deployment.Handler
	observabilityAPI = observability.Handler
	sourceAPI        = crud.Handler
)

type API struct {
	*projectAPI
	*environmentAPI
	*resourceAPI
	*routeAPI
	*variableAPI
	*registryAPI
	*deploymentAPI
	*observabilityAPI
	*sourceAPI
}

// Compile-time guard: missing method on any embedded handler fails build,
// not at first request.
var _ openapi.StrictServerInterface = (*API)(nil)

// ClusterHooks bundles every callback that reaches into the cluster from
// non-deploy paths (project + registry CRUD). Each field is nil when no
// kube client is available (dev/test); services no-op in that case.
type ClusterHooks struct {
	ProjectCleanup func(ctx context.Context, slug string)
	ProjectEnsure  func(ctx context.Context, p sqlc.Project)
	RegistrySync   func(ctx context.Context, r sqlc.Registry)
	RegistryDelete func(ctx context.Context, registryName string)
}

// NewAPI requires every handler — forgotten init = compile error, not
// runtime panic. Returns the deployment service alongside the API so the
// caller can fire boot recovery before serving requests. mcs may be nil
// when the kube metrics client could not be built; the metrics-server
// source kind silently degrades in that case.
func NewAPI(database *db.DB, rt deployment.Runtime, cs kubernetes.Interface, mcs metricsclient.Interface, hooks ClusterHooks) (*API, *deployment.Service) {
	envSvc := environment.New(database)
	depSvc := deployment.New(database, envSvc, rt)

	projectSvc := project.New(database)
	if hooks.ProjectCleanup != nil {
		projectSvc = projectSvc.WithClusterCleanup(hooks.ProjectCleanup)
	}
	if hooks.ProjectEnsure != nil {
		projectSvc = projectSvc.WithClusterEnsure(hooks.ProjectEnsure)
	}

	registrySvc := registry.New(database)
	if hooks.RegistrySync != nil || hooks.RegistryDelete != nil {
		registrySvc = registrySvc.WithClusterHooks(hooks.RegistrySync, hooks.RegistryDelete)
	}

	res := resolver.New(database, cs, mcs)
	return &API{
		projectAPI:       project.NewHandler(projectSvc),
		environmentAPI:   environment.NewHandler(envSvc),
		resourceAPI:      resource.NewHandler(resource.New(database, envSvc, cs)),
		routeAPI:         route.NewHandler(route.New(database, envSvc)),
		variableAPI:      variable.NewHandler(variable.New(database, envSvc)),
		registryAPI:      registry.NewHandler(registrySvc),
		deploymentAPI:    deployment.NewHandler(depSvc),
		observabilityAPI: observability.NewHandler(observability.New(database, envSvc, res, cs)),
		sourceAPI:        crud.NewHandler(crud.NewService(database, cs, mcs)),
	}, depSvc
}
