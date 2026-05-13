// Package loki implements source.LogsCapable against the Grafana Loki
// HTTP API. Tail is polling, not WebSocket: callers re-query the range
// endpoint with `from = lastSeenTs + 1ns` to get incremental lines.
package loki

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/source"
)

const Kind = "loki"

type Loki struct {
	id     uuid.UUID
	name   string
	base   string // e.g. "http://loki:3100"
	client *http.Client
}

func New(id uuid.UUID, name, baseURL string, auth Auth) (*Loki, error) {
	if _, err := url.Parse(baseURL); err != nil {
		return nil, fmt.Errorf("loki url: %w", err)
	}
	rt := authRoundTripper(http.DefaultTransport, auth)
	return &Loki{
		id:     id,
		name:   name,
		base:   strings.TrimRight(baseURL, "/"),
		client: &http.Client{Transport: rt, Timeout: 15 * time.Second},
	}, nil
}

func (l *Loki) ID() uuid.UUID { return l.id }
func (l *Loki) Kind() string  { return Kind }

func (l *Loki) Supports() []openapi.LogCapability {
	return []openapi.LogCapability{
		openapi.Tail,
		openapi.Search,
		openapi.Level,
	}
}

func (l *Loki) Probe(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, l.base+"/ready", nil)
	if err != nil {
		return err
	}
	resp, err := l.client.Do(req)
	if err != nil {
		return fmt.Errorf("loki ready: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("loki ready: HTTP %d", resp.StatusCode)
	}
	return nil
}

func (l *Loki) Tail(ctx context.Context, sel source.ResourceSelector, from time.Time, limit int) ([]source.LogLine, error) {
	if from.IsZero() {
		from = time.Now().Add(-10 * time.Second)
	}
	return l.queryRange(ctx, sel, "", from, time.Now(), limit)
}

func (l *Loki) Search(ctx context.Context, sel source.ResourceSelector, query string, r source.Range, limit int) ([]source.LogLine, error) {
	end := time.Now()
	start := end.Add(-r.Duration())
	return l.queryRange(ctx, sel, query, start, end, limit)
}

// queryRange runs Loki's /loki/api/v1/query_range with an optional
// case-insensitive regex line filter, parses streams into LogLines, and
// returns the union sorted ascending.
func (l *Loki) queryRange(ctx context.Context, sel source.ResourceSelector, query string, start, end time.Time, limit int) ([]source.LogLine, error) {
	q := buildSelector(sel)
	if query != "" {
		q = fmt.Sprintf(`%s |~ "(?i)%s"`, q, escapeQuery(query))
	}
	params := url.Values{}
	params.Set("query", q)
	params.Set("start", strconv.FormatInt(start.UnixNano(), 10))
	params.Set("end", strconv.FormatInt(end.UnixNano(), 10))
	params.Set("limit", strconv.Itoa(limit))
	params.Set("direction", "forward")

	endpoint := l.base + "/loki/api/v1/query_range?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := l.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("loki query: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("loki query: HTTP %d", resp.StatusCode)
	}

	var body queryRangeResp
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("loki decode: %w", err)
	}
	if body.Status != "success" {
		return nil, fmt.Errorf("loki status: %q", body.Status)
	}

	var out []source.LogLine
	for _, st := range body.Data.Result {
		pod := st.Stream["k8s_pod_name"]
		container := st.Stream["k8s_container_name"]
		for _, v := range st.Values {
			if len(v) < 2 {
				continue
			}
			tsNS, err := strconv.ParseInt(v[0], 10, 64)
			if err != nil {
				continue
			}
			msg := v[1]
			out = append(out, source.LogLine{
				Time:      time.Unix(0, tsNS).UTC(),
				Level:     source.ParseLevel(msg),
				Message:   msg,
				Pod:       pod,
				Container: container,
			})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Time.Before(out[j].Time) })
	return out, nil
}

func buildSelector(sel source.ResourceSelector) string {
	return fmt.Sprintf(
		`{k8s_namespace_name=%q,k8s_pod_name=~%q}`,
		sel.Namespace,
		sel.ResourceName+"-.*",
	)
}

// escapeQuery prevents the operator's free-text query from breaking out
// of the LogQL string literal. LogQL uses Go-style escapes inside
// double-quoted strings.
func escapeQuery(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `"`, `\"`)
	return r.Replace(s)
}

type queryRangeResp struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string         `json:"resultType"`
		Result     []lokiStreamRR `json:"result"`
	} `json:"data"`
}

type lokiStreamRR struct {
	Stream map[string]string `json:"stream"`
	Values [][]string        `json:"values"`
}
