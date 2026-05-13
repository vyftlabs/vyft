# Backend: Loki source
Implement Loki as a `Source` + `LogsCapable`.

Acceptance:
- `internal/source/loki/loki.go`:
  - `Kind() = "loki"`.
  - `Supports() []LogCapability = [tail, search, level]`.
  - `Tail(ctx, ResourceSelector, since time.Time, limit int) ([]LogLine, error)` — instant query against last N seconds since `since`, sorted ascending.
  - `Search(ctx, ResourceSelector, query string, range Range, limit int) ([]LogLine, error)` — range query w/ LogQL line filter.
- `internal/source/loki/client.go`: HTTP client w/ auth round-tripper (reuses pattern from Prometheus pkg).
- `internal/source/loki/config.go`: `StoredConfig` mirrors prometheus.StoredConfig shape; same auth secret split.
- Level extraction: heuristic on the line text (case-insensitive keyword scan: "error", "fatal" → error; "warn" → warn; "debug" → debug; else info). Conservative.
- Probe: `Probe(ctx) error` — single `/ready` GET. Used by capabilities handler.
- Unit tests against `httptest` fake Loki.

Notes: depends on `spike-loki-queries`. Lives in own subpkg parallel to `prometheus` and `metricsserver`.
