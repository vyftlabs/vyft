package prometheus

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/source"
)

// fakeProm is a minimal Prometheus HTTP API stub. queryRange returns the
// configured matrix; the test can inspect captured queries.
type fakeProm struct {
	queries []string
	// matrixByQuery returns a matrix for a specific PromQL substring match.
	// First matching key wins. Missing keys return empty matrix.
	matrixByQuery map[string][][2]float64
}

func (f *fakeProm) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		q := r.Form.Get("query")
		f.queries = append(f.queries, q)
		matrix := f.matchMatrix(q)
		resp := promResp{Status: "success"}
		resp.Data.ResultType = "matrix"
		resp.Data.Result = []promSeries{}
		if matrix != nil {
			values := make([][]interface{}, len(matrix))
			for i, p := range matrix {
				values[i] = []interface{}{p[0], floatStr(p[1])}
			}
			resp.Data.Result = []promSeries{{Metric: map[string]string{}, Values: values}}
		}
		_ = json.NewEncoder(w).Encode(resp)
	})
}

func (f *fakeProm) matchMatrix(q string) [][2]float64 {
	for key, m := range f.matrixByQuery {
		if strings.Contains(q, key) {
			return m
		}
	}
	return nil
}

type promResp struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string       `json:"resultType"`
		Result     []promSeries `json:"result"`
	} `json:"data"`
}
type promSeries struct {
	Metric map[string]string `json:"metric"`
	Values [][]interface{}   `json:"values"`
}

// PromQL JSON encodes sample values as strings.
func floatStr(v float64) string { return strconv.FormatFloat(v, 'g', -1, 64) }

func newClient(t *testing.T, fp *fakeProm) *Prometheus {
	t.Helper()
	srv := httptest.NewServer(fp.handler())
	t.Cleanup(srv.Close)
	p, err := New(uuid.New(), "test", srv.URL, Auth{Type: AuthNone})
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	return p
}

func sel() source.ResourceSelector {
	return source.ResourceSelector{Namespace: "vyft-demo-production", ResourceName: "nginx"}
}

func ts(offsetSec int64) float64 {
	return float64(time.Now().Add(-time.Duration(offsetSec)*time.Second).Unix())
}

func TestQuery_CPU_AggregatesAcrossPods(t *testing.T) {
	fp := &fakeProm{
		matrixByQuery: map[string][][2]float64{
			"container_cpu_usage_seconds_total": {
				{ts(60), 0.1},
				{ts(30), 0.2},
			},
		},
	}
	p := newClient(t, fp)

	series, err := p.Query(context.Background(), openapi.MetricKindCpu, sel(), source.DefaultRange)
	if err != nil {
		t.Fatalf("cpu: %v", err)
	}
	if len(series.Points) != 2 {
		t.Fatalf("got %d points, want 2", len(series.Points))
	}
	if series.Kind != openapi.MetricKindCpu {
		t.Errorf("kind: got %s, want cpu", series.Kind)
	}
}

func TestQuery_ReqRate_FallsBackToLegacy(t *testing.T) {
	fp := &fakeProm{
		matrixByQuery: map[string][][2]float64{
			// semconv returns empty; legacy returns data
			"http_requests_total": {{ts(15), 5.0}},
		},
	}
	p := newClient(t, fp)

	series, err := p.Query(context.Background(), openapi.MetricKindReqRate, sel(), source.DefaultRange)
	if err != nil {
		t.Fatalf("reqRate: %v", err)
	}
	if len(series.Points) != 1 || series.Points[0].Value != 5.0 {
		t.Fatalf("got %+v, want one point with value 5", series.Points)
	}
	// At least 2 queries hit Prom (semconv + legacy).
	if len(fp.queries) < 2 {
		t.Errorf("expected >= 2 queries, got %d", len(fp.queries))
	}
}

func TestQuery_ErrRate_MultipliesToPercent(t *testing.T) {
	fp := &fakeProm{
		matrixByQuery: map[string][][2]float64{
			// semconv error rate query — return 0.05 fraction
			`http_server_request_duration_seconds_count{namespace="vyft-demo-production",pod=~"nginx-.*",http_response_status_code=~"5.."}`: {{ts(15), 0.05}},
		},
	}
	p := newClient(t, fp)

	series, err := p.Query(context.Background(), openapi.MetricKindErrRate, sel(), source.DefaultRange)
	if err != nil {
		t.Fatalf("errRate: %v", err)
	}
	if len(series.Points) != 1 {
		t.Fatalf("got %d points, want 1", len(series.Points))
	}
	if got, want := series.Points[0].Value, 5.0; got != want {
		t.Errorf("value: got %v, want %v (percent)", got, want)
	}
}

func TestQuery_Latency_MergesThreeQuantiles(t *testing.T) {
	tsec := ts(15)
	fp := &fakeProm{
		matrixByQuery: map[string][][2]float64{
			"histogram_quantile(0.5":  {{tsec, 0.01}},
			"histogram_quantile(0.95": {{tsec, 0.05}},
			"histogram_quantile(0.99": {{tsec, 0.10}},
		},
	}
	p := newClient(t, fp)

	series, err := p.Query(context.Background(), openapi.MetricKindLatency, sel(), source.DefaultRange)
	if err != nil {
		t.Fatalf("latency: %v", err)
	}
	if len(series.Latency) != 1 {
		t.Fatalf("got %d latency points, want 1", len(series.Latency))
	}
	lp := series.Latency[0]
	if lp.P50 != 0.01 || lp.P95 != 0.05 || lp.P99 != 0.10 {
		t.Errorf("got p50=%v p95=%v p99=%v, want 0.01 / 0.05 / 0.10", lp.P50, lp.P95, lp.P99)
	}
}

func TestSupports_ReturnsAllFiveKinds(t *testing.T) {
	p, _ := New(uuid.New(), "test", "http://localhost", Auth{Type: AuthNone})
	got := p.Supports()
	if len(got) != 5 {
		t.Fatalf("got %d kinds, want 5", len(got))
	}
}

func TestProbeMetricNames(t *testing.T) {
	p, _ := New(uuid.New(), "test", "http://localhost", Auth{Type: AuthNone})
	cases := map[openapi.MetricKind][]string{
		openapi.MetricKindCpu:     {"container_cpu_usage_seconds_total"},
		openapi.MetricKindMemory:  {"container_memory_working_set_bytes"},
		openapi.MetricKindReqRate: {"http_server_request_duration_seconds_count", "http_requests_total"},
		openapi.MetricKindErrRate: {"http_server_request_duration_seconds_count", "http_requests_total"},
		openapi.MetricKindLatency: {"http_server_request_duration_seconds_bucket"},
	}
	for kind, want := range cases {
		got := p.ProbeMetricNames(kind)
		if len(got) != len(want) {
			t.Errorf("%s: got %v, want %v", kind, got, want)
			continue
		}
		for i, n := range want {
			if got[i] != n {
				t.Errorf("%s[%d]: got %q, want %q", kind, i, got[i], n)
			}
		}
	}
}

func TestAuth_BasicAndBearer_SetsHeaders(t *testing.T) {
	cases := []struct {
		name   string
		auth   Auth
		header string
		check  func(string) bool
	}{
		{
			name:   "basic",
			auth:   Auth{Type: AuthBasic, Username: "u", Password: "p"},
			header: "Authorization",
			check:  func(v string) bool { return strings.HasPrefix(v, "Basic ") },
		},
		{
			name:   "bearer",
			auth:   Auth{Type: AuthBearer, Token: "t0k"},
			header: "Authorization",
			check:  func(v string) bool { return v == "Bearer t0k" },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var got string
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				got = r.Header.Get(tc.header)
				_ = json.NewEncoder(w).Encode(promResp{Status: "success"})
			}))
			defer srv.Close()
			p, err := New(uuid.New(), "test", srv.URL, tc.auth)
			if err != nil {
				t.Fatalf("new: %v", err)
			}
			_, _ = p.Query(context.Background(), openapi.MetricKindCpu, sel(), source.DefaultRange)
			if !tc.check(got) {
				t.Errorf("got header %q", got)
			}
		})
	}
}
