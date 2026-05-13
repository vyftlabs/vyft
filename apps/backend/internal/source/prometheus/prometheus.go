// Package prometheus implements source.MetricsCapable against a
// Prometheus-compatible HTTP API (vanilla Prom, Mimir, VictoriaMetrics).
package prometheus

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	promv1 "github.com/prometheus/client_golang/api/prometheus/v1"
	"github.com/prometheus/common/model"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/source"
)

const Kind = "prometheus"

type Prometheus struct {
	id   uuid.UUID
	name string
	api  promv1.API
}

func New(id uuid.UUID, name, url string, auth Auth) (*Prometheus, error) {
	api, err := newAPI(url, auth)
	if err != nil {
		return nil, err
	}
	return &Prometheus{id: id, name: name, api: api}, nil
}

func (p *Prometheus) ID() uuid.UUID { return p.id }
func (p *Prometheus) Kind() string  { return Kind }

func (p *Prometheus) Supports() []openapi.MetricKind {
	return []openapi.MetricKind{
		openapi.MetricKindCpu,
		openapi.MetricKindMemory,
		openapi.MetricKindReqRate,
		openapi.MetricKindErrRate,
		openapi.MetricKindLatency,
	}
}

// ProbeMetricNames returns the underlying metric series names whose
// existence implies the kind is detected. RED falls back to legacy
// `http_requests_total` when semconv isn't deployed.
func (p *Prometheus) ProbeMetricNames(kind openapi.MetricKind) []string {
	switch kind {
	case openapi.MetricKindCpu:
		return []string{"container_cpu_usage_seconds_total"}
	case openapi.MetricKindMemory:
		return []string{"container_memory_working_set_bytes"}
	case openapi.MetricKindReqRate, openapi.MetricKindErrRate:
		return []string{
			"http_server_request_duration_seconds_count",
			"http_requests_total",
		}
	case openapi.MetricKindLatency:
		return []string{"http_server_request_duration_seconds_bucket"}
	}
	return nil
}

func (p *Prometheus) Query(ctx context.Context, kind openapi.MetricKind, sel source.ResourceSelector, r source.Range) (source.Series, error) {
	vars := queryVars{Namespace: sel.Namespace, Resource: sel.ResourceName}
	end := time.Now().UTC()
	rng := promv1.Range{Start: end.Add(-r.Duration()), End: end, Step: r.Step()}

	switch kind {
	case openapi.MetricKindCpu:
		pts, err := p.queryAggregated(ctx, expand(cpuTmpl, vars), rng)
		if err != nil {
			return source.Series{}, err
		}
		// PromQL rate() of container_cpu_usage_seconds_total yields cores
		// (cpu-seconds / second). Wire format is millicores, matching
		// metrics-server's MilliValue().
		for i := range pts {
			pts[i].Value *= 1000
		}
		return source.Series{Kind: kind, Range: r, Points: pts}, nil

	case openapi.MetricKindMemory:
		pts, err := p.queryAggregated(ctx, expand(memoryTmpl, vars), rng)
		if err != nil {
			return source.Series{}, err
		}
		return source.Series{Kind: kind, Range: r, Points: pts}, nil

	case openapi.MetricKindReqRate:
		pts, err := p.queryWithFallback(ctx, expand(reqRateSemconv, vars), expand(reqRateLegacy, vars), rng)
		if err != nil {
			return source.Series{}, err
		}
		return source.Series{Kind: kind, Range: r, Points: pts}, nil

	case openapi.MetricKindErrRate:
		pts, err := p.queryWithFallback(ctx, expand(errRateSemconv, vars), expand(errRateLegacy, vars), rng)
		if err != nil {
			return source.Series{}, err
		}
		// Spec wants percent; PromQL returns 0-1 fraction.
		for i := range pts {
			pts[i].Value *= 100
		}
		return source.Series{Kind: kind, Range: r, Points: pts}, nil

	case openapi.MetricKindLatency:
		latency, err := p.queryLatency(ctx, vars, rng)
		if err != nil {
			return source.Series{}, err
		}
		return source.Series{Kind: kind, Range: r, Latency: latency}, nil
	}

	return source.Series{}, fmt.Errorf("prometheus: unsupported kind %q", kind)
}

// queryAggregated runs a single PromQL range query and aggregates all
// returned series at each timestamp via sum. Callers pass queries that
// either return one aggregate series or multiple per-pod series — both
// collapse to a single timeline for the workload-level view.
func (p *Prometheus) queryAggregated(ctx context.Context, q string, rng promv1.Range) ([]source.Point, error) {
	val, _, err := p.api.QueryRange(ctx, q, rng)
	if err != nil {
		return nil, fmt.Errorf("prometheus query: %w", err)
	}
	matrix, ok := val.(model.Matrix)
	if !ok {
		return nil, fmt.Errorf("prometheus: unexpected result type %T", val)
	}
	return sumByTime(matrix), nil
}

// queryWithFallback tries the primary query first and only invokes the
// fallback when primary returned zero series. Used for RED metrics
// (semconv → legacy).
func (p *Prometheus) queryWithFallback(ctx context.Context, primary, fallback string, rng promv1.Range) ([]source.Point, error) {
	pts, err := p.queryAggregated(ctx, primary, rng)
	if err != nil {
		return nil, err
	}
	if len(pts) > 0 {
		return pts, nil
	}
	return p.queryAggregated(ctx, fallback, rng)
}

func (p *Prometheus) queryLatency(ctx context.Context, vars queryVars, rng promv1.Range) ([]source.LatencyPoint, error) {
	p50, err := p.queryAggregated(ctx, expand(latencyQuantile(0.50), vars), rng)
	if err != nil {
		return nil, err
	}
	p95, err := p.queryAggregated(ctx, expand(latencyQuantile(0.95), vars), rng)
	if err != nil {
		return nil, err
	}
	p99, err := p.queryAggregated(ctx, expand(latencyQuantile(0.99), vars), rng)
	if err != nil {
		return nil, err
	}
	return mergeLatency(p50, p95, p99), nil
}

// sumByTime collapses a matrix to []Point by summing all series at each
// timestamp. NaN values are skipped.
func sumByTime(m model.Matrix) []source.Point {
	if len(m) == 0 {
		return nil
	}
	sum := map[int64]float64{}
	for _, ss := range m {
		for _, sp := range ss.Values {
			t := int64(sp.Timestamp)
			f := float64(sp.Value)
			if !isFinite(f) {
				continue
			}
			sum[t] += f
		}
	}
	out := make([]source.Point, 0, len(sum))
	for t, v := range sum {
		out = append(out, source.Point{
			Time:  time.UnixMilli(t).UTC(),
			Value: v,
		})
	}
	sortPoints(out)
	return out
}

// mergeLatency joins three quantile timelines into LatencyPoint slices
// indexed by timestamp. Missing quantiles for a timestamp default to 0.
func mergeLatency(p50, p95, p99 []source.Point) []source.LatencyPoint {
	idx := map[int64]*source.LatencyPoint{}
	get := func(p source.Point) *source.LatencyPoint {
		k := p.Time.UnixMilli()
		lp, ok := idx[k]
		if !ok {
			lp = &source.LatencyPoint{Time: p.Time}
			idx[k] = lp
		}
		return lp
	}
	for _, p := range p50 {
		get(p).P50 = p.Value
	}
	for _, p := range p95 {
		get(p).P95 = p.Value
	}
	for _, p := range p99 {
		get(p).P99 = p.Value
	}
	out := make([]source.LatencyPoint, 0, len(idx))
	for _, lp := range idx {
		out = append(out, *lp)
	}
	sortLatency(out)
	return out
}

func isFinite(f float64) bool { return !math.IsNaN(f) && !math.IsInf(f, 0) }

func sortPoints(p []source.Point) {
	// insertion sort — small N typical for our ranges and step sizes
	for i := 1; i < len(p); i++ {
		j := i
		for j > 0 && p[j-1].Time.After(p[j].Time) {
			p[j-1], p[j] = p[j], p[j-1]
			j--
		}
	}
}

func sortLatency(p []source.LatencyPoint) {
	for i := 1; i < len(p); i++ {
		j := i
		for j > 0 && p[j-1].Time.After(p[j].Time) {
			p[j-1], p[j] = p[j], p[j-1]
			j--
		}
	}
}
