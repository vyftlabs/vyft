# Backend: metrics endpoints
Handlers for capabilities + per-kind metrics. Capabilities runs combined probe; per-kind executes the query.

Acceptance:
- `GET .../metrics/capabilities`:
  - No metrics data source configured → `{ dataSourceKind: null, detected: [] }`.
  - Data source configured → returns `{ dataSourceKind, detected }`.
  - `detected` = `dataSource.Supports()` ∩ kinds whose probe succeeded.
  - For each kind in ceiling: if `dataSource.ProbeMetricNames(kind) == nil`, treat as statically-detected (metrics-server CPU/Mem). Otherwise check via the combined probe.
  - Combined probe: a single Prom query of form `count by (__name__) ({__name__=~"name1|name2|..."})`. One round-trip.
  - If probe errors (Prom unreachable/auth): respond `503` with body `{ dataSourceKind, error: "unreachable" }`. Web maps this to the "disabled — unreachable" panel state.
  - 5-minute cache per `(dataSourceId, hash(config))` is acceptable; invalidate on data source mutation or default change.
- `GET .../metrics/{kind}?range=15m`:
  - Looks up resource, builds `ResourceSelector`, resolves the metrics-domain data source, calls `Query`.
  - Returns `MetricSeries` (may be `points: []` — empty-data is a valid response, not an error).
  - `404` when kind not in `dataSource.Supports()`.
  - `503` when query call to data source fails.
  - `range` defaults to `15m`.

Notes: depends on `backend-data-source-resolver`. Probe metric names per kind come from each data source via `ProbeMetricNames`.
