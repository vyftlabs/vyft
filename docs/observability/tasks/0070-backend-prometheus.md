# Backend: Prometheus source
Implement Prometheus as a `Source` + `MetricsCapable` using `prometheus/client_golang/api`.

Acceptance:
- `internal/source/prometheus/client.go`: wraps API with auth round-tripper for `none | basic | bearer`.
- `internal/source/prometheus/queries.go`: PromQL templates per kind, parameterized by `{namespace, resource}`.
- `internal/source/prometheus/prometheus.go`:
  - `Kind() = "prometheus"`.
  - `Supports()` returns `[cpu, memory, reqRate, errRate, latency]` (ceiling, static).
  - `ProbeMetricNames(kind) []string` returns the metric names that must exist in Prom for the kind to be considered detected. Used by capability handler's combined probe.
  - `Query` dispatches by kind, executes `QueryRange`.
- Latency: 3 separate quantile queries merged into `[]LatencyPoint` by timestamp.
- Unit tests with `httptest` fake Prom.

## ProbeMetricNames

| Kind | Metric names |
|---|---|
| cpu | `container_cpu_usage_seconds_total` |
| memory | `container_memory_working_set_bytes` |
| reqRate | `http_server_request_duration_seconds_count`, `http_requests_total` (legacy fallback) |
| errRate | `http_server_request_duration_seconds_count`, `http_requests_total` (legacy fallback) |
| latency | `http_server_request_duration_seconds_bucket` |

Probe succeeds if ANY of the listed names returns series.

## Validated query templates (CPU + Memory)

Validated against a stock cAdvisor scrape in a local kind cluster. `{namespace}` = workload namespace, `{resource}` = `vyft.dev/resource` label value.

```
# CPU (cores) — VALIDATED
sum by (pod) (rate(container_cpu_usage_seconds_total{
  namespace="{namespace}", pod=~"{resource}-.*",
  container!="POD", container!=""
}[5m]))

# Memory (bytes, working set) — VALIDATED
sum by (pod) (container_memory_working_set_bytes{
  namespace="{namespace}", pod=~"{resource}-.*",
  container!="POD", container!=""
})
```

Both confirmed: returned data for the `vyft-demo-production / nginx` pod (37 MiB working set, idle CPU).

## RED templates (semconv primary, legacy fallback)

OTel semantic conventions are the canonical contract. Legacy `http_requests_total` accepted when semconv is absent. The Prometheus source's `Query` should try semconv first; fall back to legacy at query time if semconv returns no series.

```
# Request rate (req/s) — semconv
sum(rate(http_server_request_duration_seconds_count{
  namespace="{namespace}", pod=~"{resource}-.*"
}[1m]))

# Request rate — legacy fallback
sum(rate(http_requests_total{
  namespace="{namespace}", pod=~"{resource}-.*"
}[1m]))

# Error rate — semconv (fraction 0-1; UI multiplies by 100)
sum(rate(http_server_request_duration_seconds_count{
  namespace="{namespace}", pod=~"{resource}-.*", http_response_status_code=~"5.."
}[1m])) /
sum(rate(http_server_request_duration_seconds_count{
  namespace="{namespace}", pod=~"{resource}-.*"
}[1m]))

# Error rate — legacy fallback
sum(rate(http_requests_total{
  namespace="{namespace}", pod=~"{resource}-.*", status=~"5.."
}[1m])) /
sum(rate(http_requests_total{
  namespace="{namespace}", pod=~"{resource}-.*"
}[1m]))

# Latency p50 / p95 / p99 (seconds; UI auto-scales to ms/s) — semconv only
histogram_quantile(0.95,
  sum by (le) (rate(http_server_request_duration_seconds_bucket{
    namespace="{namespace}", pod=~"{resource}-.*"
  }[1m])))
```

Latency uses histogram only. Summary-based instrumentation not supported v1 (see spec Gaps).

## Label selector strategy (locked)

- Filter pods by `namespace="<ns>"` + `pod=~"<resource>-.*"`. PromQL regex is fully anchored.
- Exclude pod sandbox/aggregate rows: `container!="POD", container!=""`.
- Aggregate: `sum by (pod) (...)` returns per-pod (drilldown-friendly). For workload total, wrap in another `sum(...)`.

## Range → QueryRange mapping

- `15m` → step `15s`
- `1h` → step `1m`
- `6h` → step `2m`
- `24h` → step `5m`

## Validation pending

RED + Latency templates need real validation. Deploy any OTel-semconv-emitting workload (Beyla DaemonSet, OTel auto-instrumented sample app, manual histogram) and confirm queries return data. Track as a follow-up validation; do not block ship.
