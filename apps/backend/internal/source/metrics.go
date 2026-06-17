package source

import "context"

// Prober checks which of the given metric names exist for a resource.
// Empty ResourceSelector means "anywhere" (connectivity probes).
type Prober interface {
	Probe(ctx context.Context, sel ResourceSelector, metricNames []string) (map[string]bool, error)
}

// MetricsCapable is the source contract for the metrics domain. Each
// kind family has its own query method returning the appropriate series
// type — no discriminated union, no scaling, canonical units throughout.
//
//	QueryResource:  cpu, memory, disk → per-series with optional limit/request per point
//	QueryRate:      requestRate, errorRate → single aggregate series
//	QueryLatency:   latency          → single series with p50/p95/p99 per point
//	QueryNetwork:   network          → per-pod series with rx + tx per point
//
// disk rides QueryResource: per-PVC series, value = used bytes, limit =
// PVC capacity, series ID = disk name.
//
// Implementations should return empty slices (not errors) when there's
// no data — the handler maps that to 200 with an empty body. They should
// return an error only for genuine failures (auth, network, query syntax).
type MetricsCapable interface {
	Source

	// Supports returns the kinds the source could in principle serve.
	Supports() []MetricKind

	// ProbeMetricNames returns the underlying metric names that must
	// exist for the kind to be considered runtime-detected. nil means
	// static detection (always-on when reachable) — metrics-server.
	ProbeMetricNames(kind MetricKind) []string

	QueryResource(ctx context.Context, kind MetricKind, sel ResourceSelector, r TimeRange) ([]ResourceSeries, error)
	QueryRate(ctx context.Context, kind MetricKind, sel ResourceSelector, r TimeRange) (RateSeries, error)
	QueryLatency(ctx context.Context, sel ResourceSelector, r TimeRange) (LatencySeries, error)
	QueryNetwork(ctx context.Context, sel ResourceSelector, r TimeRange) ([]NetworkSeries, error)
}
