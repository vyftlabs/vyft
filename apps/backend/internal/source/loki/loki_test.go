package loki

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

type fakeLoki struct {
	queries []string
	streams []lokiStreamRR
}

func (f *fakeLoki) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ready", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ready\n"))
	})
	mux.HandleFunc("/loki/api/v1/query_range", func(w http.ResponseWriter, r *http.Request) {
		f.queries = append(f.queries, r.URL.RawQuery)
		resp := queryRangeResp{Status: "success"}
		resp.Data.ResultType = "streams"
		resp.Data.Result = f.streams
		_ = json.NewEncoder(w).Encode(resp)
	})
	return mux
}

func newSrv(t *testing.T, fp *fakeLoki) *Loki {
	t.Helper()
	srv := httptest.NewServer(fp.handler())
	t.Cleanup(srv.Close)
	l, err := New(uuid.New(), "test", srv.URL, Auth{Type: AuthNone})
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	return l
}

func sel() source.ResourceSelector {
	return source.ResourceSelector{Namespace: "vyft-demo-production", ResourceName: "nginx"}
}

func TestProbe_OK(t *testing.T) {
	l := newSrv(t, &fakeLoki{})
	if err := l.Probe(context.Background()); err != nil {
		t.Fatalf("probe: %v", err)
	}
}

func TestTail_SortsAscendingAndExtractsLevel(t *testing.T) {
	now := time.Now()
	ns := func(t time.Time) string { return strconv.FormatInt(t.UnixNano(), 10) }
	fp := &fakeLoki{
		streams: []lokiStreamRR{
			{
				Stream: map[string]string{
					"k8s_pod_name":       "nginx-aaa",
					"k8s_container_name": "nginx",
				},
				Values: [][]string{
					{ns(now.Add(2 * time.Second)), "ERROR upstream timeout"},
					{ns(now), "INFO ok"},
					{ns(now.Add(time.Second)), "WARN slow"},
				},
			},
		},
	}
	l := newSrv(t, fp)

	lines, err := l.Tail(context.Background(), sel(), now.Add(-10*time.Second), 100)
	if err != nil {
		t.Fatalf("tail: %v", err)
	}
	if len(lines) != 3 {
		t.Fatalf("got %d lines, want 3", len(lines))
	}
	if !lines[0].Time.Before(lines[2].Time) {
		t.Errorf("not sorted ascending: %v", lines)
	}
	want := []openapi.LogLevel{
		openapi.LogLevelInfo,
		openapi.LogLevelWarn,
		openapi.LogLevelError,
	}
	for i, lvl := range want {
		if lines[i].Level != lvl {
			t.Errorf("line[%d].Level = %s, want %s", i, lines[i].Level, lvl)
		}
	}
	if lines[0].Pod != "nginx-aaa" || lines[0].Container != "nginx" {
		t.Errorf("pod/container not propagated: %+v", lines[0])
	}
}

func TestSearch_AddsLineFilter(t *testing.T) {
	fp := &fakeLoki{}
	l := newSrv(t, fp)
	_, _ = l.Search(context.Background(), sel(), "boom", source.DefaultRange, 50)
	if len(fp.queries) == 0 {
		t.Fatal("no query captured")
	}
	if !strings.Contains(fp.queries[0], `%7C~+%22%28%3Fi%29boom%22`) {
		t.Errorf("query missing line filter: %s", fp.queries[0])
	}
}

func TestSearch_EscapesQuery(t *testing.T) {
	fp := &fakeLoki{}
	l := newSrv(t, fp)
	_, _ = l.Search(context.Background(), sel(), `with "quote"`, source.DefaultRange, 50)
	if len(fp.queries) == 0 {
		t.Fatal("no query captured")
	}
	// URL-encoded form of `\"` is `%5C%22`. Check it appears.
	if !strings.Contains(fp.queries[0], `%5C%22`) {
		t.Errorf("query didn't escape quote: %s", fp.queries[0])
	}
}

func TestSupports_AllThree(t *testing.T) {
	l, _ := New(uuid.New(), "test", "http://localhost", Auth{Type: AuthNone})
	got := l.Supports()
	if len(got) != 3 {
		t.Fatalf("supports: got %d, want 3", len(got))
	}
}

func TestAuth_BasicAndBearer(t *testing.T) {
	cases := []struct {
		name  string
		auth  Auth
		check func(*http.Request) bool
	}{
		{
			name:  "basic",
			auth:  Auth{Type: AuthBasic, Username: "u", Password: "p"},
			check: func(r *http.Request) bool { _, _, ok := r.BasicAuth(); return ok },
		},
		{
			name:  "bearer",
			auth:  Auth{Type: AuthBearer, Token: "t0k"},
			check: func(r *http.Request) bool { return r.Header.Get("Authorization") == "Bearer t0k" },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var ok bool
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				ok = tc.check(r)
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte("ready"))
			}))
			defer srv.Close()
			l, err := New(uuid.New(), "test", srv.URL, tc.auth)
			if err != nil {
				t.Fatalf("new: %v", err)
			}
			_ = l.Probe(context.Background())
			if !ok {
				t.Error("auth header not set / wrong")
			}
		})
	}
}
