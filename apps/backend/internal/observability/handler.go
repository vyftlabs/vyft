// Package observability serves the read-only telemetry endpoints (events,
// logs, metrics). Metrics endpoints dispatch to the active source via the
// resolver; capabilities runs a combined probe to surface which metric
// kinds are actually queryable.
package observability

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/environment"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
	"github.com/vyftlabs/vyft/apps/backend/internal/runtime/k8s"
	"github.com/vyftlabs/vyft/apps/backend/internal/source"
	"github.com/vyftlabs/vyft/apps/backend/internal/source/resolver"
)

type Service struct {
	db  *db.DB
	env *environment.Service
	res *resolver.Resolver
}

func New(d *db.DB, env *environment.Service, res *resolver.Resolver) *Service {
	return &Service{db: d, env: env, res: res}
}

type Handler struct{ svc *Service }

func NewHandler(s *Service) *Handler { return &Handler{svc: s} }

func (h *Handler) ListResourceEvents(_ context.Context, _ openapi.ListResourceEventsRequestObject) (openapi.ListResourceEventsResponseObject, error) {
	return openapi.ListResourceEvents200JSONResponse{}, nil
}

func (h *Handler) GetResourceLogsCapabilities(ctx context.Context, _ openapi.GetResourceLogsCapabilitiesRequestObject) (openapi.GetResourceLogsCapabilitiesResponseObject, error) {
	lc, err := h.svc.res.ResolveLogs(ctx)
	if err != nil {
		return nil, apierr.Internal(err)
	}
	if lc == nil {
		return openapi.GetResourceLogsCapabilities200JSONResponse{
			SourceKind: nil,
			Detected:   []openapi.LogCapability{},
		}, nil
	}
	if err := lc.Probe(ctx); err != nil {
		return logsUnreachable503(lc.Kind()), nil
	}
	sk := toAPISourceKind(lc.Kind())
	return openapi.GetResourceLogsCapabilities200JSONResponse{
		SourceKind: &sk,
		Detected:   lc.Supports(),
	}, nil
}

func (h *Handler) TailResourceLogs(ctx context.Context, req openapi.TailResourceLogsRequestObject) (openapi.TailResourceLogsResponseObject, error) {
	lc, err := h.svc.res.ResolveLogs(ctx)
	if err != nil {
		return nil, apierr.Internal(err)
	}
	if lc == nil {
		return nil, apierr.NotFound("no logs source configured")
	}
	sel, err := h.svc.buildSelector(ctx, uuid.UUID(req.ResourceId))
	if err != nil {
		return nil, err
	}
	var from time.Time
	if req.Params.SincePollAt != nil {
		from = *req.Params.SincePollAt
	}
	limit := 500
	if req.Params.Limit != nil {
		limit = *req.Params.Limit
	}
	lines, err := lc.Tail(ctx, sel, from, limit)
	if err != nil {
		return nil, apierr.ServiceUnavailable(err.Error())
	}
	return openapi.TailResourceLogs200JSONResponse(toWireLines(lines)), nil
}

func (h *Handler) SearchResourceLogs(ctx context.Context, req openapi.SearchResourceLogsRequestObject) (openapi.SearchResourceLogsResponseObject, error) {
	lc, err := h.svc.res.ResolveLogs(ctx)
	if err != nil {
		return nil, apierr.Internal(err)
	}
	if lc == nil {
		return nil, apierr.NotFound("no logs source configured")
	}
	if !supportsLog(lc, openapi.Search) {
		return nil, apierr.BadRequest(fmt.Sprintf("source %q doesn't support search", lc.Kind()))
	}
	sel, err := h.svc.buildSelector(ctx, uuid.UUID(req.ResourceId))
	if err != nil {
		return nil, err
	}
	rangeStr := ""
	if req.Params.Range != nil {
		rangeStr = string(*req.Params.Range)
	}
	r, err := source.ParseRange(rangeStr)
	if err != nil {
		return nil, apierr.BadRequest(err.Error())
	}
	q := ""
	if req.Params.Query != nil {
		q = *req.Params.Query
	}
	limit := 200
	if req.Params.Limit != nil {
		limit = *req.Params.Limit
	}
	lines, err := lc.Search(ctx, sel, q, r, limit)
	if err != nil {
		return nil, apierr.ServiceUnavailable(err.Error())
	}
	return openapi.SearchResourceLogs200JSONResponse(toWireLines(lines)), nil
}

func supportsLog(lc source.LogsCapable, want openapi.LogCapability) bool {
	for _, c := range lc.Supports() {
		if c == want {
			return true
		}
	}
	return false
}

func toWireLines(lines []source.LogLine) []openapi.LogLine {
	out := make([]openapi.LogLine, len(lines))
	for i, l := range lines {
		var pod, container *string
		if l.Pod != "" {
			p := l.Pod
			pod = &p
		}
		if l.Container != "" {
			c := l.Container
			container = &c
		}
		out[i] = openapi.LogLine{
			Timestamp: l.Time,
			Level:     l.Level,
			Message:   l.Message,
			Pod:       pod,
			Container: container,
		}
	}
	return out
}

// logsUnreachable503 mirrors the metrics capabilities unreachable shape
// — a 503 response with the source kind in the body so the UI can show
// the right disabled-state without losing context.
type logsUnreachable503Body struct {
	SourceKind openapi.SourceKind `json:"sourceKind"`
	Error      string             `json:"error"`
}

type logsUnreachable503Resp struct{ body logsUnreachable503Body }

func (r logsUnreachable503Resp) VisitGetResourceLogsCapabilitiesResponse(w http.ResponseWriter) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	return json.NewEncoder(w).Encode(r.body)
}

func logsUnreachable503(kind string) openapi.GetResourceLogsCapabilitiesResponseObject {
	return logsUnreachable503Resp{body: logsUnreachable503Body{
		SourceKind: toAPISourceKind(kind),
		Error:      "unreachable",
	}}
}

// toAPISourceKind translates a Go-internal kind constant (snake_case,
// matches the DB enum) to the camelCase value the OpenAPI spec emits.
func toAPISourceKind(internal string) openapi.SourceKind {
	switch internal {
	case "metrics_server":
		return openapi.MetricsServer
	case "prometheus":
		return openapi.Prometheus
	}
	return openapi.SourceKind(internal)
}

// metricsContext bundles the prep work shared across the five metric
// handlers: resolve the source, build the selector, parse from/to.
// Returns 404 when the kind isn't supported or isn't detected for this
// resource, 503 when the source can't be reached.
func (h *Handler) metricsContext(ctx context.Context, resourceID openapi_types.UUID, kind source.MetricKind, from, to *int) (source.MetricsCapable, source.ResourceSelector, source.TimeRange, error) {
	mc, err := h.svc.res.ResolveMetrics(ctx)
	if err != nil {
		return nil, source.ResourceSelector{}, source.TimeRange{}, apierr.Internal(err)
	}
	if mc == nil {
		return nil, source.ResourceSelector{}, source.TimeRange{}, apierr.NotFound("no metrics source configured")
	}
	if !supports(mc, kind) {
		return nil, source.ResourceSelector{}, source.TimeRange{}, apierr.NotFound(fmt.Sprintf("source %q does not support kind %q", mc.Kind(), kind))
	}

	sel, err := h.svc.buildSelector(ctx, uuid.UUID(resourceID))
	if err != nil {
		return nil, source.ResourceSelector{}, source.TimeRange{}, err
	}

	// No probe gate — sources return empty series when data is absent.
	// The UI renders that as a "no data" state. Avoids 404 for the common
	// "metric not yet collected" case.

	r := parseTimeRange(from, to)
	return mc, sel, r, nil
}

// parseTimeRange normalizes the optional from/to params into a TimeRange.
// Defaults: to = now, from = now - 15m. Both clamped to a 7-day window
// upper bound to keep one request from running a 30-day query.
func parseTimeRange(from, to *int) source.TimeRange {
	now := time.Now().UTC()
	end := now
	if to != nil {
		end = time.UnixMilli(int64(*to)).UTC()
	}
	start := end.Add(-15 * time.Minute)
	if from != nil {
		start = time.UnixMilli(int64(*from)).UTC()
	}
	if end.Sub(start) > 7*24*time.Hour {
		start = end.Add(-7 * 24 * time.Hour)
	}
	if !start.Before(end) {
		// Caller passed from >= to; collapse to a zero-duration window. The
		// source will return an empty series; the UI renders nothing.
		start = end
	}
	return source.TimeRange{From: start, To: end}
}

// GetResourceCpuMetrics serves /metrics/cpu — per-pod CPU usage in cores.
func (h *Handler) GetResourceCpuMetrics(ctx context.Context, req openapi.GetResourceCpuMetricsRequestObject) (openapi.GetResourceCpuMetricsResponseObject, error) {
	mc, sel, r, err := h.metricsContext(ctx, req.ResourceId, source.KindCpu, req.Params.From, req.Params.To)
	if err != nil {
		return nil, err
	}
	series, err := mc.QueryResource(ctx, source.KindCpu, sel, r)
	if err != nil {
		return nil, apierr.ServiceUnavailable(err.Error())
	}
	return openapi.GetResourceCpuMetrics200JSONResponse(toResourceMetrics(series)), nil
}

// GetResourceMemoryMetrics serves /metrics/memory — per-pod memory in bytes.
func (h *Handler) GetResourceMemoryMetrics(ctx context.Context, req openapi.GetResourceMemoryMetricsRequestObject) (openapi.GetResourceMemoryMetricsResponseObject, error) {
	mc, sel, r, err := h.metricsContext(ctx, req.ResourceId, source.KindMemory, req.Params.From, req.Params.To)
	if err != nil {
		return nil, err
	}
	series, err := mc.QueryResource(ctx, source.KindMemory, sel, r)
	if err != nil {
		return nil, apierr.ServiceUnavailable(err.Error())
	}
	return openapi.GetResourceMemoryMetrics200JSONResponse(toResourceMetrics(series)), nil
}

// GetResourceRequestRateMetrics serves /metrics/requestRate — req/sec.
func (h *Handler) GetResourceRequestRateMetrics(ctx context.Context, req openapi.GetResourceRequestRateMetricsRequestObject) (openapi.GetResourceRequestRateMetricsResponseObject, error) {
	mc, sel, r, err := h.metricsContext(ctx, req.ResourceId, source.KindRequestRate, req.Params.From, req.Params.To)
	if err != nil {
		return nil, err
	}
	s, err := mc.QueryRate(ctx, source.KindRequestRate, sel, r)
	if err != nil {
		return nil, apierr.ServiceUnavailable(err.Error())
	}
	return openapi.GetResourceRequestRateMetrics200JSONResponse(toRateMetrics(s)), nil
}

// GetResourceErrorRateMetrics serves /metrics/errorRate — fraction 0..1.
func (h *Handler) GetResourceErrorRateMetrics(ctx context.Context, req openapi.GetResourceErrorRateMetricsRequestObject) (openapi.GetResourceErrorRateMetricsResponseObject, error) {
	mc, sel, r, err := h.metricsContext(ctx, req.ResourceId, source.KindErrorRate, req.Params.From, req.Params.To)
	if err != nil {
		return nil, err
	}
	s, err := mc.QueryRate(ctx, source.KindErrorRate, sel, r)
	if err != nil {
		return nil, apierr.ServiceUnavailable(err.Error())
	}
	return openapi.GetResourceErrorRateMetrics200JSONResponse(toRateMetrics(s)), nil
}

// GetResourceLatencyMetrics serves /metrics/latency — p50/p95/p99 in seconds.
func (h *Handler) GetResourceLatencyMetrics(ctx context.Context, req openapi.GetResourceLatencyMetricsRequestObject) (openapi.GetResourceLatencyMetricsResponseObject, error) {
	mc, sel, r, err := h.metricsContext(ctx, req.ResourceId, source.KindLatency, req.Params.From, req.Params.To)
	if err != nil {
		return nil, err
	}
	s, err := mc.QueryLatency(ctx, sel, r)
	if err != nil {
		return nil, apierr.ServiceUnavailable(err.Error())
	}
	return openapi.GetResourceLatencyMetrics200JSONResponse(toLatencyMetrics(s)), nil
}

// toResourceMetrics converts internal ResourceSeries slices to the
// generated wire shape. Empty/zero Limit/Request are omitted from the
// payload.
func toResourceMetrics(in []source.ResourceSeries) openapi.ResourceMetrics {
	out := openapi.ResourceMetrics{Series: make([]openapi.ResourceSeries, len(in))}
	for i, s := range in {
		points := make([]openapi.ResourcePoint, len(s.Points))
		for j, p := range s.Points {
			rp := openapi.ResourcePoint{
				Timestamp: int(p.Time.UnixMilli()),
				Value:     float32(p.Value),
			}
			if p.Limit > 0 {
				v := float32(p.Limit)
				rp.Limit = &v
			}
			if p.Request > 0 {
				v := float32(p.Request)
				rp.Request = &v
			}
			points[j] = rp
		}
		entry := openapi.ResourceSeries{Points: points}
		if s.ID != "" {
			id := s.ID
			entry.Id = &id
		}
		out.Series[i] = entry
	}
	return out
}

func toRateMetrics(in source.RateSeries) openapi.RateMetrics {
	points := make([]openapi.RatePoint, len(in.Points))
	for j, p := range in.Points {
		points[j] = openapi.RatePoint{
			Timestamp: int(p.Time.UnixMilli()),
			Value:     float32(p.Value),
		}
	}
	entry := openapi.RateSeries{Points: points}
	if in.ID != "" {
		id := in.ID
		entry.Id = &id
	}
	return openapi.RateMetrics{Series: []openapi.RateSeries{entry}}
}

func toLatencyMetrics(in source.LatencySeries) openapi.LatencyMetrics {
	points := make([]openapi.LatencyPoint, len(in.Points))
	for j, p := range in.Points {
		points[j] = openapi.LatencyPoint{
			Timestamp: int(p.Time.UnixMilli()),
			P50:       float32(p.P50),
			P95:       float32(p.P95),
			P99:       float32(p.P99),
		}
	}
	entry := openapi.LatencySeries{Points: points}
	if in.ID != "" {
		id := in.ID
		entry.Id = &id
	}
	return openapi.LatencyMetrics{Series: []openapi.LatencySeries{entry}}
}

func (s *Service) buildSelector(ctx context.Context, resourceID uuid.UUID) (source.ResourceSelector, error) {
	row, err := s.db.Q.GetResource(ctx, pgxid.PgUUID(resourceID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return source.ResourceSelector{}, apierr.NotFound("resource not found")
		}
		return source.ResourceSelector{}, apierr.Internal(err)
	}
	proj, err := s.db.Q.GetProject(ctx, row.ProjectID)
	if err != nil {
		return source.ResourceSelector{}, apierr.Internal(err)
	}
	return source.ResourceSelector{
		Namespace:    k8s.NamespaceFor(proj.Slug, environment.DefaultSlug),
		ResourceName: row.Slug,
	}, nil
}

func supports(mc source.MetricsCapable, k source.MetricKind) bool {
	for _, supported := range mc.Supports() {
		if supported == k {
			return true
		}
	}
	return false
}

func dedup(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

