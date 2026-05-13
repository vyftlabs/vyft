package source

import (
	"context"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
)

// Prober runs a single combined existence check for a set of metric
// names. Optional — sources whose detection is static (e.g. metrics-
// server) don't implement it. Returns map[name]bool: true means at least
// one series exists for that name. Implementations should perform a
// single round-trip.
type Prober interface {
	Probe(ctx context.Context, metricNames []string) (map[string]bool, error)
}

// MetricsCapable is implemented by sources that can serve the metrics
// domain. The capabilities handler probes each kind in Supports() against
// ProbeMetricNames() to decide what's actually queryable.
type MetricsCapable interface {
	Source

	// Supports returns the kinds the source could in principle serve
	// (its ceiling). Static, no I/O.
	Supports() []openapi.MetricKind

	// ProbeMetricNames returns the underlying metric names that must
	// exist for the kind to be considered runtime-detected. nil means
	// the kind is statically detected (no probe needed) — e.g. metrics-
	// server's CPU/Memory are always-on when the source is reachable.
	ProbeMetricNames(kind openapi.MetricKind) []string

	// Query executes a single kind query and returns a Series. Empty
	// points slice is a valid response (empty-data state on the UI), not
	// an error.
	Query(ctx context.Context, kind openapi.MetricKind, sel ResourceSelector, r Range) (Series, error)
}
