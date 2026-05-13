// Package source defines the generic data source abstraction and its
// metrics capability surface. Each concrete source (Prometheus,
// metrics-server) lives in a sub-package and implements Source and
// optionally MetricsCapable.
package source

import "github.com/google/uuid"

// Source is anything Vyft can ask for data. ID is the configured row's
// uuid; Kind is the discriminator from the spec (e.g. "prometheus",
// "metrics_server").
type Source interface {
	ID() uuid.UUID
	Kind() string
}
