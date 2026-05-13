# Backend: Loki source
Implement Loki as a `Source` + `LogsCapable`.

Acceptance:
- `internal/source/loki/loki.go`:
  - `Kind() = "loki"`.
  - `Supports() []LogCapability = [tail, search, level]`.
  - `Tail(ctx, ResourceSelector, since time.Time, limit int) ([]LogLine, error)` — range query from `since` to `now`, sorted ascending. The "tail" loop is polling: caller passes `since = lastSeenTs + 1ns` on each request. No WebSocket.
  - `Search(ctx, ResourceSelector, query string, range Range, limit int) ([]LogLine, error)` — range query w/ `|~ "(?i)<query>"` line filter when `query != ""`.
- `internal/source/loki/client.go`: HTTP client w/ auth round-tripper (reuses pattern from Prometheus pkg).
- `internal/source/loki/config.go`: `StoredConfig` mirrors `prometheus.StoredConfig`; same auth secret split.
- Level extraction: case-insensitive keyword scan — "error"/"fatal" → error; "warn"/"warning" → warn; "debug" → debug; else info. Conservative.
- Probe: `Probe(ctx) error` — single `GET /ready`. Used by capabilities handler.
- Unit tests against `httptest` fake Loki.

## Validated against a local Loki (v3.4.1)

- **Range / search**: `GET /loki/api/v1/query_range?query=<LogQL>&start=<ns>&end=<ns>&limit=<n>&direction=forward`
- **Label selector (matches Beyla's convention already used for metrics)**:
  `{k8s_namespace_name="<namespace>",k8s_pod_name=~"<resource>-.*"}`
- **Tail (polling)**: same range endpoint with `start = lastSeenNs + 1`, `direction=forward`. Backend takes `since time.Time`, converts to ns; first call defaults `since = now - 10s`.
- **Line filter**: `{<labels>} |~ "(?i)<needle>"` (regex, case-insensitive).
- **Probe**: `GET /ready` → 200.
- **Response shape**:
  ```
  { "status": "success",
    "data": {
      "resultType": "streams",
      "result": [
        { "stream": { "k8s_namespace_name": ..., "k8s_pod_name": ..., "k8s_container_name": ... },
          "values": [["1778644908049773920", "INFO request handled in 5ms path=/"], ...]
        }
      ]
    }
  }
  ```
- **Per-line decode**: timestamp ns string → `time.Time`; `line` → `Message`; level extracted via heuristic; `Pod = stream.k8s_pod_name`, `Container = stream.k8s_container_name`.

Notes: lives in own subpkg parallel to `prometheus` and `metricsserver`. Aggregate lines across streams in Go, sort by timestamp ascending.
