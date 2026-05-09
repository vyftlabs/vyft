package server

import (
	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
	"github.com/vyftlabs/vyft/apps/backend/internal/observability"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/project"
	"github.com/vyftlabs/vyft/apps/backend/internal/registry"
	"github.com/vyftlabs/vyft/apps/backend/internal/resource"
	"github.com/vyftlabs/vyft/apps/backend/internal/route"
	"github.com/vyftlabs/vyft/apps/backend/internal/variable"
)

// Aliases rename embedded fields so multiple *Handler types don't collide on
// the unqualified field name "Handler". Method promotion is unaffected.
type (
	projectAPI       = project.Handler
	resourceAPI      = resource.Handler
	routeAPI         = route.Handler
	variableAPI      = variable.Handler
	registryAPI      = registry.Handler
	deploymentAPI    = deployment.Handler
	observabilityAPI = observability.Handler
)

type API struct {
	*projectAPI
	*resourceAPI
	*routeAPI
	*variableAPI
	*registryAPI
	*deploymentAPI
	*observabilityAPI
}

// Compile-time guard: missing method on any embedded handler fails build,
// not at first request.
var _ openapi.StrictServerInterface = (*API)(nil)

// NewAPI requires every handler — forgotten init = compile error, not
// runtime panic.
func NewAPI(database *db.DB) *API {
	return &API{
		projectAPI:       project.NewHandler(project.New(database)),
		resourceAPI:      resource.NewHandler(resource.New(database)),
		routeAPI:         route.NewHandler(route.New(database)),
		variableAPI:      variable.NewHandler(variable.New(database)),
		registryAPI:      registry.NewHandler(registry.New(database)),
		deploymentAPI:    deployment.NewHandler(deployment.New(database, deployment.NewStubRuntime())),
		observabilityAPI: observability.NewHandler(observability.New()),
	}
}
