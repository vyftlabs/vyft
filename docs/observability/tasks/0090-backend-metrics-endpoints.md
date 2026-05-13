# Backend: metrics endpoints
Handlers for capabilities + per-kind metrics. Capabilities runs combined probe; per-kind executes the query.

Acceptance:
- `GET .../metrics/capabilities`:
  - No metrics source configured → `{ sourceKind: null, detected: [] }`.
  - Source configured → returns `{ sourceKind, detected }`.
  - `detected` = `source.Supports()` ∩ kinds whose probe succeeded.
  - For each kind in ceiling: if `source.ProbeMetricNames(kind) == nil`, treat as statically-detected (metrics-server CPU/Mem). Otherwise check via the combined probe.
  - Combined probe: a single Prom query of form `count by (__name__) ({__name__=~"name1|name2|..."})`. One round-trip.
  - If probe errors (Prom unreachable/auth): respond `503` with body `{ sourceKind, error: "unreachable" }`. Web maps this to the "disabled — unreachable" panel state.
  - 5-minute cache per `(sourceId, hash(config))` is acceptable; invalidate on source mutation or default change.
- `GET .../metrics/{kind}?range=15m`:
  - Looks up resource, builds `ResourceSelector`, resolves the metrics-domain source, calls `Query`.
  - Returns `MetricSeries` (may be `points: []` — empty-data is a valid response, not an error).
  - `404` when kind not in `source.Supports()`.
  - `503` when query call to source fails.
  - `range` defaults to `15m`.

Notes: depends on `backend-source-resolver`. Probe metric names per kind come from each source via `ProbeMetricNames`.
