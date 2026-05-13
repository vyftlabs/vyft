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

func (h *Handler) GetResourceMetricsCapabilities(ctx context.Context, _ openapi.GetResourceMetricsCapabilitiesRequestObject) (openapi.GetResourceMetricsCapabilitiesResponseObject, error) {
	mc, err := h.svc.res.ResolveMetrics(ctx)
	if err != nil {
		return nil, apierr.Internal(err)
	}
	if mc == nil {
		return openapi.GetResourceMetricsCapabilities200JSONResponse{
			SourceKind: nil,
			Detected:   []openapi.MetricKind{},
		}, nil
	}

	detected := []openapi.MetricKind{}
	probeNames := []string{}
	probeKinds := map[openapi.MetricKind][]string{}

	for _, kind := range mc.Supports() {
		names := mc.ProbeMetricNames(kind)
		if names == nil {
			// Statically detected (metrics-server) — always-on when reachable.
			detected = append(detected, kind)
			continue
		}
		probeKinds[kind] = names
		probeNames = append(probeNames, names...)
	}

	if len(probeNames) > 0 {
		prober, ok := mc.(source.Prober)
		if !ok {
			return nil, apierr.Internal(fmt.Errorf("source %q reports probe names but is not a Prober", mc.Kind()))
		}
		hits, err := prober.Probe(ctx, dedup(probeNames))
		if err != nil {
			// Auth fail / unreachable — surface as 503 + body w/ source kind
			// so the UI can render the "unreachable" disabled panel state.
			return unreachable503(mc.Kind()), nil
		}
		for kind, names := range probeKinds {
			for _, n := range names {
				if hits[n] {
					detected = append(detected, kind)
					break
				}
			}
		}
	}

	sk := toAPISourceKind(mc.Kind())
	return openapi.GetResourceMetricsCapabilities200JSONResponse{
		SourceKind: &sk,
		Detected:   detected,
	}, nil
}

// toAPISourceKind translates a Go-internal kind constant (snake_case,
// matches the DB enum) to the camelCase value the OpenAPI spec emits.
// Wire format must use camelCase so the web client's MetricsCeiling map
// resolves correctly.
func toAPISourceKind(internal string) openapi.SourceKind {
	switch internal {
	case "metrics_server":
		return openapi.MetricsServer
	case "prometheus":
		return openapi.Prometheus
	}
	return openapi.SourceKind(internal)
}

func (h *Handler) GetResourceMetricSeries(ctx context.Context, req openapi.GetResourceMetricSeriesRequestObject) (openapi.GetResourceMetricSeriesResponseObject, error) {
	mc, err := h.svc.res.ResolveMetrics(ctx)
	if err != nil {
		return nil, apierr.Internal(err)
	}
	if mc == nil {
		return nil, apierr.NotFound("no metrics source configured")
	}
	if !supports(mc, req.Kind) {
		return nil, apierr.NotFound(fmt.Sprintf("source %q does not support kind %q", mc.Kind(), req.Kind))
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

	series, err := mc.Query(ctx, req.Kind, sel, r)
	if err != nil {
		return nil, apierr.ServiceUnavailable(err.Error())
	}

	return toMetricSeriesResponse(series)
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
		ResourceName: row.Name,
	}, nil
}

func supports(mc source.MetricsCapable, k openapi.MetricKind) bool {
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

// toMetricSeriesResponse converts the internal Series to one of the five
// generated MetricSeriesN union variants. Latency populates the latency
// variant; everything else uses the matching RangePoint variant.
func toMetricSeriesResponse(s source.Series) (openapi.GetResourceMetricSeries200JSONResponse, error) {
	var ms openapi.MetricSeries
	r := openapi.MetricRange(s.Range)
	switch s.Kind {
	case openapi.MetricKindCpu:
		out := openapi.MetricSeries0{
			Kind:   openapi.MetricSeries0KindCpu,
			Range:  r,
			Points: source.ToOpenAPIRangePoints(s.Points),
		}
		if s.Limit > 0 {
			l := float32(s.Limit)
			out.Limit = &l
		}
		if bp := byPodCPU(s.ByPod); bp != nil {
			out.ByPod = bp
		}
		if err := ms.FromMetricSeries0(out); err != nil {
			return openapi.GetResourceMetricSeries200JSONResponse{}, err
		}
	case openapi.MetricKindMemory:
		out := openapi.MetricSeries1{
			Kind:   "memory",
			Range:  r,
			Points: source.ToOpenAPIRangePoints(s.Points),
		}
		if s.Limit > 0 {
			l := float32(s.Limit)
			out.Limit = &l
		}
		if bp := byPodMem(s.ByPod); bp != nil {
			out.ByPod = bp
		}
		if err := ms.FromMetricSeries1(out); err != nil {
			return openapi.GetResourceMetricSeries200JSONResponse{}, err
		}
	case openapi.MetricKindReqRate:
		if err := ms.FromMetricSeries2(openapi.MetricSeries2{
			Kind:   "reqRate",
			Range:  r,
			Points: source.ToOpenAPIRangePoints(s.Points),
		}); err != nil {
			return openapi.GetResourceMetricSeries200JSONResponse{}, err
		}
	case openapi.MetricKindErrRate:
		if err := ms.FromMetricSeries3(openapi.MetricSeries3{
			Kind:   "errRate",
			Range:  r,
			Points: source.ToOpenAPIRangePoints(s.Points),
		}); err != nil {
			return openapi.GetResourceMetricSeries200JSONResponse{}, err
		}
	case openapi.MetricKindLatency:
		if err := ms.FromMetricSeries4(openapi.MetricSeries4{
			Kind:   "latency",
			Range:  r,
			Points: source.ToOpenAPILatencyPoints(s.Latency),
		}); err != nil {
			return openapi.GetResourceMetricSeries200JSONResponse{}, err
		}
	default:
		return openapi.GetResourceMetricSeries200JSONResponse{}, fmt.Errorf("unsupported metric kind %q", s.Kind)
	}
	return openapi.GetResourceMetricSeries200JSONResponse(ms), nil
}

// byPodCPU / byPodMem convert the internal per-pod breakdown into the
// anonymous struct shape generated by the OpenAPI codegen. Returns nil
// when the source didn't produce a breakdown (metrics-server), so the
// JSON omits the field entirely.
func byPodCPU(in []source.PodSeries) *[]struct {
	Pod    string              `json:"pod"`
	Points []openapi.RangePoint `json:"points"`
} {
	if len(in) == 0 {
		return nil
	}
	out := make([]struct {
		Pod    string              `json:"pod"`
		Points []openapi.RangePoint `json:"points"`
	}, len(in))
	for i, ps := range in {
		out[i].Pod = ps.Pod
		out[i].Points = source.ToOpenAPIRangePoints(ps.Points)
	}
	return &out
}

func byPodMem(in []source.PodSeries) *[]struct {
	Pod    string              `json:"pod"`
	Points []openapi.RangePoint `json:"points"`
} {
	return byPodCPU(in)
}

// unreachable503 is a hand-built 503 response that satisfies the
// capabilities response interface. The JSON body carries sourceKind so
// the web client can render the "unreachable" disabled-state correctly.
type unreachable503Body struct {
	SourceKind openapi.SourceKind `json:"sourceKind"`
	Error      string             `json:"error"`
}

type unreachable503Resp struct{ body unreachable503Body }

func (r unreachable503Resp) VisitGetResourceMetricsCapabilitiesResponse(w http.ResponseWriter) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	return json.NewEncoder(w).Encode(r.body)
}

func unreachable503(kind string) openapi.GetResourceMetricsCapabilitiesResponseObject {
	return unreachable503Resp{body: unreachable503Body{
		SourceKind: toAPISourceKind(kind),
		Error:      "unreachable",
	}}
}
