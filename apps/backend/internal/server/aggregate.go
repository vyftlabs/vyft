package server

import (
	"context"

	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
	"github.com/vyftlabs/vyft/apps/backend/internal/environment"
	"github.com/vyftlabs/vyft/apps/backend/internal/observability"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/project"
	"github.com/vyftlabs/vyft/apps/backend/internal/registry"
	"github.com/vyftlabs/vyft/apps/backend/internal/resource"
	"github.com/vyftlabs/vyft/apps/backend/internal/route"
	"github.com/vyftlabs/vyft/apps/backend/internal/source"
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
	sourceAPI        = source.Handler
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

// NewAPI requires every handler — forgotten init = compile error, not
// runtime panic. Returns the deployment service alongside the API so the
// caller can fire boot recovery before serving requests.
func NewAPI(database *db.DB, rt deployment.Runtime, cleanup func(ctx context.Context, slug string)) (*API, *deployment.Service) {
	envSvc := environment.New(database)
	depSvc := deployment.New(database, envSvc, rt)
	projectSvc := project.New(database)
	if cleanup != nil {
		projectSvc = projectSvc.WithClusterCleanup(func(ctx context.Context, slug string) {
			cleanup(ctx, slug)
		})
	}
	return &API{
		projectAPI:       project.NewHandler(projectSvc),
		environmentAPI:   environment.NewHandler(envSvc),
		resourceAPI:      resource.NewHandler(resource.New(database, envSvc)),
		routeAPI:         route.NewHandler(route.New(database, envSvc)),
		variableAPI:      variable.NewHandler(variable.New(database, envSvc)),
		registryAPI:      registry.NewHandler(registry.New(database)),
		deploymentAPI:    deployment.NewHandler(depSvc),
		observabilityAPI: observability.NewHandler(observability.New()),
		sourceAPI:        source.NewHandler(),
	}, depSvc
}
