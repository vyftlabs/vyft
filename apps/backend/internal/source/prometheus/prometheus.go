// Package prometheus implements source.MetricsCapable against a
// Prometheus-compatible HTTP API (vanilla Prom, Mimir, VictoriaMetrics).
package prometheus

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	promv1 "github.com/prometheus/client_golang/api/prometheus/v1"
	"github.com/prometheus/common/model"

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

func (p *Prometheus) Supports() []source.MetricKind {
	return []source.MetricKind{
		source.KindCpu,
		source.KindMemory,
		source.KindDisk,
		source.KindNetwork,
		source.KindRequestRate,
		source.KindErrorRate,
		source.KindLatency,
		source.KindConnections,
		source.KindTransactions,
		source.KindCacheHit,
		source.KindDbSize,
		source.KindReplicationLag,
		source.KindRedisMemory,
		source.KindRedisClients,
		source.KindRedisOps,
	}
}

// ProbeMetricNames returns the underlying metric series names whose
// existence implies the kind is detected. RED falls back to legacy
// `http_requests_total` when semconv isn't deployed.
func (p *Prometheus) ProbeMetricNames(kind source.MetricKind) []string {
	switch kind {
	case source.KindCpu:
		return []string{"container_cpu_usage_seconds_total"}
	case source.KindMemory:
		return []string{"container_memory_working_set_bytes"}
	case source.KindDisk:
		return []string{"kubelet_volume_stats_used_bytes"}
	case source.KindNetwork:
		return []string{"container_network_receive_bytes_total"}
	case source.KindRequestRate, source.KindErrorRate:
		return []string{
			"http_server_request_duration_seconds_count",
			"http_requests_total",
		}
	case source.KindLatency:
		return []string{"http_server_request_duration_seconds_bucket"}
	case source.KindConnections:
		return []string{"cnpg_backends_total"}
	case source.KindTransactions:
		return []string{"cnpg_pg_stat_database_xact_commit"}
	case source.KindCacheHit:
		return []string{"cnpg_pg_stat_database_blks_hit"}
	case source.KindDbSize:
		return []string{"cnpg_pg_database_size_bytes"}
	case source.KindReplicationLag:
		return []string{"cnpg_pg_replication_lag"}
	case source.KindRedisMemory:
		return []string{"redis_memory_used_bytes"}
	case source.KindRedisClients:
		return []string{"redis_connected_clients"}
	case source.KindRedisOps:
		return []string{"redis_commands_processed_total"}
	}
	return nil
}

// QueryResource serves cpu + memory. Returns one ResourceSeries per pod
// with per-point limit (max across pods, identical for every pod since
// the limit is a workload-level cap). Values in canonical units (cores
// or bytes) — no scaling.
func (p *Prometheus) QueryResource(ctx context.Context, kind source.MetricKind, sel source.ResourceSelector, r source.TimeRange) ([]source.ResourceSeries, error) {
	if kind == source.KindDisk {
		return p.queryDisk(ctx, sel, r)
	}
	if kind == source.KindConnections {
		return p.queryConnections(ctx, sel, r)
	}
	if kind == source.KindDbSize {
		return p.queryDbSize(ctx, sel, r)
	}
	if kind == source.KindRedisMemory {
		return p.queryAggregatedWithLimit(ctx, redisMemoryTmpl, redisMemoryLimitTmpl, sel, r)
	}
	if kind == source.KindRedisClients {
		return p.queryAggregatedWithLimit(ctx, redisClientsTmpl, redisClientsLimitTmpl, sel, r)
	}

	vars := queryVars{Namespace: sel.Namespace, Resource: sel.ResourceName}
	rng := promRange(r)

	var perPodTmpl, limitTmpl string
	switch kind {
	case source.KindCpu:
		perPodTmpl, limitTmpl = cpuPerPodTmpl, cpuLimitTmpl
	case source.KindMemory:
		perPodTmpl, limitTmpl = memoryPerPodTmpl, memoryLimitTmpl
	default:
		return nil, fmt.Errorf("prometheus: not a resource kind: %q", kind)
	}

	byPod, err := p.queryPerPod(ctx, expand(perPodTmpl, vars), rng)
	if err != nil {
		return nil, err
	}
	stripResourcePrefix(byPod, sel.ResourceName)

	limit, _ := p.queryLimitInstant(ctx, expand(limitTmpl, vars))
	if kind == source.KindMemory && limit >= memCap {
		// cAdvisor leaks node capacity for pods without a real limit.
		limit = 0
	}

	out := make([]source.ResourceSeries, len(byPod))
	for i, ps := range byPod {
		points := make([]source.ResourcePoint, len(ps.Points))
		for j, p := range ps.Points {
			points[j] = source.ResourcePoint{
				Time:  p.Time,
				Value: p.Value,
				Limit: limit,
			}
		}
		out[i] = source.ResourceSeries{ID: ps.Pod, Points: points}
	}
	return out, nil
}

// QueryRate serves requestRate + errorRate. Single aggregate series.
// Values in canonical units: req/sec (requestRate) or fraction 0..1 (errorRate).
func (p *Prometheus) QueryRate(ctx context.Context, kind source.MetricKind, sel source.ResourceSelector, r source.TimeRange) (source.RateSeries, error) {
	vars := queryVars{Namespace: sel.Namespace, Resource: sel.ResourceName}
	rng := promRange(r)

	var primary, fallback string
	switch kind {
	case source.KindRequestRate:
		primary, fallback = reqRateSemconv, reqRateLegacy
	case source.KindErrorRate:
		primary, fallback = errRateSemconv, errRateLegacy
	case source.KindTransactions:
		return p.queryRateSingle(ctx, expand(txnTmpl, vars), rng)
	case source.KindCacheHit:
		return p.queryRateSingle(ctx, expand(cacheHitTmpl, vars), rng)
	case source.KindReplicationLag:
		return p.queryRateSingle(ctx, expand(replicationLagTmpl, vars), rng)
	case source.KindRedisOps:
		return p.queryRateSingle(ctx, expand(redisOpsTmpl, vars), rng)
	default:
		return source.RateSeries{}, fmt.Errorf("prometheus: not a rate kind: %q", kind)
	}

	pts, err := p.queryWithFallback(ctx, expand(primary, vars), expand(fallback, vars), rng)
	if err != nil {
		return source.RateSeries{}, err
	}
	rate := make([]source.RatePoint, len(pts))
	for i, p := range pts {
		rate[i] = source.RatePoint{Time: p.Time, Value: p.Value}
	}
	return source.RateSeries{Points: rate}, nil
}

// QueryLatency runs three quantile queries in series and merges by
// timestamp into LatencyPoints carrying p50/p95/p99.
func (p *Prometheus) QueryLatency(ctx context.Context, sel source.ResourceSelector, r source.TimeRange) (source.LatencySeries, error) {
	vars := queryVars{Namespace: sel.Namespace, Resource: sel.ResourceName}
	rng := promRange(r)

	p50, err := p.queryAggregated(ctx, expand(latencyQuantile(0.50), vars), rng)
	if err != nil {
		return source.LatencySeries{}, err
	}
	p95, err := p.queryAggregated(ctx, expand(latencyQuantile(0.95), vars), rng)
	if err != nil {
		return source.LatencySeries{}, err
	}
	p99, err := p.queryAggregated(ctx, expand(latencyQuantile(0.99), vars), rng)
	if err != nil {
		return source.LatencySeries{}, err
	}
	return source.LatencySeries{Points: mergeLatency(p50, p95, p99)}, nil
}

// queryDisk serves the disk kind: one ResourceSeries per PVC, value =
// used bytes, limit = that PVC's capacity. Series ID is the disk name
// (the "<resource>-" PVC prefix is stripped, mirroring per-pod naming).
func (p *Prometheus) queryDisk(ctx context.Context, sel source.ResourceSelector, r source.TimeRange) ([]source.ResourceSeries, error) {
	vars := queryVars{Namespace: sel.Namespace, Resource: sel.ResourceName}
	rng := promRange(r)

	byPVC, err := p.queryPerSeries(ctx, expand(diskUsedPerPVCTmpl, vars), rng, "persistentvolumeclaim")
	if err != nil {
		return nil, err
	}
	stripResourcePrefix(byPVC, sel.ResourceName)

	caps, err := p.queryInstantByLabel(ctx, expand(diskCapPerPVCTmpl, vars), "persistentvolumeclaim")
	if err != nil {
		return nil, err
	}

	out := make([]source.ResourceSeries, len(byPVC))
	for i, ps := range byPVC {
		// caps is keyed by the raw PVC name; ps.Pod is already stripped.
		limit := caps[sel.ResourceName+"-"+ps.Pod]
		points := make([]source.ResourcePoint, len(ps.Points))
		for j, pt := range ps.Points {
			points[j] = source.ResourcePoint{Time: pt.Time, Value: pt.Value, Limit: limit}
		}
		out[i] = source.ResourceSeries{ID: ps.Pod, Points: points}
	}
	return out, nil
}

// queryConnections serves the postgres connections kind: a single aggregate
// series (active backends) with max_connections as the per-point limit.
func (p *Prometheus) queryConnections(ctx context.Context, sel source.ResourceSelector, r source.TimeRange) ([]source.ResourceSeries, error) {
	vars := queryVars{Namespace: sel.Namespace, Resource: sel.ResourceName}
	rng := promRange(r)
	pts, err := p.queryAggregated(ctx, expand(connectionsTmpl, vars), rng)
	if err != nil {
		return nil, err
	}
	limit, _ := p.queryLimitInstant(ctx, expand(connectionsLimitTmpl, vars))
	points := make([]source.ResourcePoint, len(pts))
	for i, pt := range pts {
		points[i] = source.ResourcePoint{Time: pt.Time, Value: pt.Value, Limit: limit}
	}
	return []source.ResourceSeries{{Points: points}}, nil
}

// queryDbSize serves the postgres dbSize kind: a single aggregate series
// (sum of database sizes) with the PVC's requested storage as the limit.
func (p *Prometheus) queryDbSize(ctx context.Context, sel source.ResourceSelector, r source.TimeRange) ([]source.ResourceSeries, error) {
	vars := queryVars{Namespace: sel.Namespace, Resource: sel.ResourceName}
	rng := promRange(r)
	pts, err := p.queryAggregated(ctx, expand(dbSizeTmpl, vars), rng)
	if err != nil {
		return nil, err
	}
	limit, _ := p.queryLimitInstant(ctx, expand(dbSizeLimitTmpl, vars))
	points := make([]source.ResourcePoint, len(pts))
	for i, pt := range pts {
		points[i] = source.ResourcePoint{Time: pt.Time, Value: pt.Value, Limit: limit}
	}
	return []source.ResourceSeries{{Points: points}}, nil
}

// queryAggregatedWithLimit runs an aggregated value query + an instant limit
// query and returns a single ResourceSeries (value + per-point limit). Shared
// by the redis memory/clients kinds.
func (p *Prometheus) queryAggregatedWithLimit(ctx context.Context, valTmpl, limitTmpl string, sel source.ResourceSelector, r source.TimeRange) ([]source.ResourceSeries, error) {
	vars := queryVars{Namespace: sel.Namespace, Resource: sel.ResourceName}
	rng := promRange(r)
	pts, err := p.queryAggregated(ctx, expand(valTmpl, vars), rng)
	if err != nil {
		return nil, err
	}
	limit, _ := p.queryLimitInstant(ctx, expand(limitTmpl, vars))
	points := make([]source.ResourcePoint, len(pts))
	for i, pt := range pts {
		points[i] = source.ResourcePoint{Time: pt.Time, Value: pt.Value, Limit: limit}
	}
	return []source.ResourceSeries{{Points: points}}, nil
}

// queryRateSingle runs one aggregated range query and wraps it as a single
// RateSeries. Used by the postgres transactions + cacheHit kinds.
func (p *Prometheus) queryRateSingle(ctx context.Context, q string, rng promv1.Range) (source.RateSeries, error) {
	pts, err := p.queryAggregated(ctx, q, rng)
	if err != nil {
		return source.RateSeries{}, err
	}
	rate := make([]source.RatePoint, len(pts))
	for i, pt := range pts {
		rate[i] = source.RatePoint{Time: pt.Time, Value: pt.Value}
	}
	return source.RateSeries{Points: rate}, nil
}

// QueryNetwork serves the network kind: per-pod rx + tx throughput in
// bytes/second. rx and tx are queried independently and merged by
// (pod, timestamp).
func (p *Prometheus) QueryNetwork(ctx context.Context, sel source.ResourceSelector, r source.TimeRange) ([]source.NetworkSeries, error) {
	vars := queryVars{Namespace: sel.Namespace, Resource: sel.ResourceName}
	rng := promRange(r)

	rx, err := p.queryPerSeries(ctx, expand(netRxPerPodTmpl, vars), rng, "pod")
	if err != nil {
		return nil, err
	}
	tx, err := p.queryPerSeries(ctx, expand(netTxPerPodTmpl, vars), rng, "pod")
	if err != nil {
		return nil, err
	}
	stripResourcePrefix(rx, sel.ResourceName)
	stripResourcePrefix(tx, sel.ResourceName)
	return mergeNetwork(rx, tx), nil
}

// --- helpers -----------------------------------------------------------

// memCap is the sanity threshold for "this isn't a real memory limit,
// it's node capacity leaked from cAdvisor".
const memCap = float64(int64(1) << 60)

// promRange builds a promv1.Range from a source.TimeRange. End is
// truncated to the step boundary so independent per-kind queries return
// the same wall-clock timestamps (x-axis alignment).
func promRange(r source.TimeRange) promv1.Range {
	step := r.Step()
	end := r.To.UTC().Truncate(step)
	start := r.From.UTC().Truncate(step)
	return promv1.Range{Start: start, End: end, Step: step}
}

type queryPoint struct {
	Time  time.Time
	Value float64
}

type queryPodSeries struct {
	Pod    string
	Points []queryPoint
}

// queryLimitInstant runs an instant query whose PromQL already
// aggregates to a single max-across-pods scalar.
func (p *Prometheus) queryLimitInstant(ctx context.Context, q string) (float64, error) {
	val, _, err := p.api.Query(ctx, q, time.Now())
	if err != nil {
		return 0, fmt.Errorf("prometheus limit query: %w", err)
	}
	vec, ok := val.(model.Vector)
	if !ok {
		return 0, fmt.Errorf("prometheus limit: unexpected result type %T", val)
	}
	if len(vec) == 0 {
		return 0, nil
	}
	v := float64(vec[0].Value)
	if !isFinite(v) || v <= 0 {
		return 0, nil
	}
	return v, nil
}

// queryPerPod runs a per-pod range query and returns one queryPodSeries
// per pod.
func (p *Prometheus) queryPerPod(ctx context.Context, q string, rng promv1.Range) ([]queryPodSeries, error) {
	return p.queryPerSeries(ctx, q, rng, "pod")
}

// queryPerSeries runs a range query and returns one queryPodSeries per
// distinct value of the given identity label (e.g. "pod" or
// "persistentvolumeclaim"). The label value is stored in queryPodSeries.Pod.
func (p *Prometheus) queryPerSeries(ctx context.Context, q string, rng promv1.Range, label model.LabelName) ([]queryPodSeries, error) {
	val, _, err := p.api.QueryRange(ctx, q, rng)
	if err != nil {
		return nil, fmt.Errorf("prometheus query: %w", err)
	}
	matrix, ok := val.(model.Matrix)
	if !ok {
		return nil, fmt.Errorf("prometheus: unexpected result type %T", val)
	}
	out := make([]queryPodSeries, 0, len(matrix))
	for _, ss := range matrix {
		id := string(ss.Metric[label])
		if id == "" {
			continue
		}
		pts := make([]queryPoint, 0, len(ss.Values))
		for _, sp := range ss.Values {
			f := float64(sp.Value)
			if !isFinite(f) {
				continue
			}
			pts = append(pts, queryPoint{
				Time:  time.UnixMilli(int64(sp.Timestamp)).UTC(),
				Value: f,
			})
		}
		out = append(out, queryPodSeries{Pod: id, Points: pts})
	}
	return out, nil
}

// queryInstantByLabel runs an instant query and returns a map from the
// given identity label's value to the sample value. Used for per-PVC
// disk capacity (the limit varies by PVC, unlike cpu/memory caps).
func (p *Prometheus) queryInstantByLabel(ctx context.Context, q string, label model.LabelName) (map[string]float64, error) {
	val, _, err := p.api.Query(ctx, q, time.Now())
	if err != nil {
		return nil, fmt.Errorf("prometheus instant query: %w", err)
	}
	vec, ok := val.(model.Vector)
	if !ok {
		return nil, fmt.Errorf("prometheus instant: unexpected result type %T", val)
	}
	out := make(map[string]float64, len(vec))
	for _, sample := range vec {
		id := string(sample.Metric[label])
		if id == "" {
			continue
		}
		f := float64(sample.Value)
		if !isFinite(f) || f <= 0 {
			continue
		}
		out[id] = f
	}
	return out, nil
}

// queryAggregated runs a single PromQL range query and aggregates all
// returned series at each timestamp via sum.
func (p *Prometheus) queryAggregated(ctx context.Context, q string, rng promv1.Range) ([]queryPoint, error) {
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
// fallback when primary returned zero series. Used for RED metrics.
func (p *Prometheus) queryWithFallback(ctx context.Context, primary, fallback string, rng promv1.Range) ([]queryPoint, error) {
	pts, err := p.queryAggregated(ctx, primary, rng)
	if err != nil {
		return nil, err
	}
	if len(pts) > 0 {
		return pts, nil
	}
	return p.queryAggregated(ctx, fallback, rng)
}

// stripResourcePrefix drops the redundant "<resource>-" leading
// substring from each pod name. The drawer chrome already shows the
// resource name; per-pod identifiers only need the unique suffix.
func stripResourcePrefix(byPod []queryPodSeries, resource string) {
	prefix := resource + "-"
	for i := range byPod {
		byPod[i].Pod = strings.TrimPrefix(byPod[i].Pod, prefix)
	}
}

// sumByTime collapses a matrix to []queryPoint by summing all series at
// each timestamp. NaN values are skipped.
func sumByTime(m model.Matrix) []queryPoint {
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
	out := make([]queryPoint, 0, len(sum))
	for t, v := range sum {
		out = append(out, queryPoint{
			Time:  time.UnixMilli(t).UTC(),
			Value: v,
		})
	}
	sortPoints(out)
	return out
}

// mergeLatency joins three quantile timelines into LatencyPoint slices
// indexed by timestamp. Missing quantiles default to 0.
func mergeLatency(p50, p95, p99 []queryPoint) []source.LatencyPoint {
	idx := map[int64]*source.LatencyPoint{}
	get := func(p queryPoint) *source.LatencyPoint {
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

// mergeNetwork joins per-pod rx and tx timelines into NetworkSeries. Pods
// are unioned across both directions; each (pod, timestamp) carries
// whichever of rx/tx exists (missing side defaults to 0).
func mergeNetwork(rx, tx []queryPodSeries) []source.NetworkSeries {
	type acc struct {
		order  []int64
		points map[int64]*source.NetworkPoint
	}
	byPod := map[string]*acc{}
	get := func(pod string, t time.Time) *source.NetworkPoint {
		a, ok := byPod[pod]
		if !ok {
			a = &acc{points: map[int64]*source.NetworkPoint{}}
			byPod[pod] = a
		}
		k := t.UnixMilli()
		np, ok := a.points[k]
		if !ok {
			np = &source.NetworkPoint{Time: t}
			a.points[k] = np
			a.order = append(a.order, k)
		}
		return np
	}
	for _, s := range rx {
		for _, pt := range s.Points {
			get(s.Pod, pt.Time).Rx = pt.Value
		}
	}
	for _, s := range tx {
		for _, pt := range s.Points {
			get(s.Pod, pt.Time).Tx = pt.Value
		}
	}
	out := make([]source.NetworkSeries, 0, len(byPod))
	for pod, a := range byPod {
		points := make([]source.NetworkPoint, 0, len(a.order))
		for _, k := range a.order {
			points = append(points, *a.points[k])
		}
		sortNetwork(points)
		out = append(out, source.NetworkSeries{ID: pod, Points: points})
	}
	return out
}

func isFinite(f float64) bool { return !math.IsNaN(f) && !math.IsInf(f, 0) }

func sortPoints(p []queryPoint) {
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

func sortNetwork(p []source.NetworkPoint) {
	for i := 1; i < len(p); i++ {
		j := i
		for j > 0 && p[j-1].Time.After(p[j].Time) {
			p[j-1], p[j] = p[j], p[j-1]
			j--
		}
	}
}
