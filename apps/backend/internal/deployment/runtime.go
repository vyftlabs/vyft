// Package deployment owns the deployment service + Runtime contract.
//
// Domain types live here as plain Go structs translated from sqlc rows at
// the service boundary. The Runtime interface is the single seam between
// "DB → snapshot" (this package) and "snapshot → cluster" (runtime/k8s).
package deployment

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
)

// Project is the small slice of project identity that the runtime needs to
// label k8s objects and pick a namespace.
type Project struct {
	ID   uuid.UUID
	Slug string
	Name string
}

// Resource is a project-scoped declaration translated from a sqlc.Resource.
// `Spec` is the kind-specific spec MINUS routes (routes live separately).
type Resource struct {
	ID        uuid.UUID
	Name      string
	Kind      string
	Spec      json.RawMessage
	PositionX float64
	PositionY float64
}

// Route is env-scoped. The State the caller passes in already filters routes
// to the target environment.
type Route struct {
	ID         uuid.UUID
	ResourceID uuid.UUID
	Domain     string
	Path       string
	PathType   string
	Port       int32
	TLS        bool
	Config     json.RawMessage
}

// Variable is env-scoped. `ResourceID` is nil for shared (project-level)
// variables. `Value` is plaintext; the deployment service decrypts secrets
// before handing the State to the runtime.
type Variable struct {
	ID         uuid.UUID
	ResourceID *uuid.UUID
	Key        string
	Value      string
	Secret     bool
}

// ResourceVariable is the import edge: resource X imports variable V under
// key K (env-scoped).
type ResourceVariable struct {
	ResourceID uuid.UUID
	VariableID uuid.UUID
	Key        string
}

// Registry is project-scoped (one set of registries per project) and the
// `Password` is the decrypted credential.
type Registry struct {
	ID       uuid.UUID
	Name     string
	URL      string
	Username string
	Password string
}

// State is the snapshot the runtime receives. Pre-filtered to one
// environment by the caller — the runtime never sees other envs' data.
type State struct {
	Resources         []Resource
	Registries        []Registry
	Routes            []Route
	Variables         []Variable
	ResourceVariables []ResourceVariable
}

// Runtime is the swap point between DB and cluster. One method, one
// direction: take a State snapshot, reconcile the cluster.
type Runtime interface {
	Apply(ctx context.Context, project Project, env string, state State) error
}
