# Backend: logs endpoints
Wire the spec routes into the observability handler.

Acceptance:
- `GET .../logs/capabilities`:
  - No source configured → `{ sourceKind: null, detected: [] }`.
  - Source configured → calls `LogsCapable.Probe`; on failure returns `503 + { sourceKind, error: "unreachable" }`.
  - Success → `{ sourceKind, detected: Supports() }`. No per-capability probe like metrics; logs cap declaration is static per kind.
- `GET .../logs/tail`:
  - Resolves source → calls `Tail`. Builds `ResourceSelector` via the existing helper.
  - Empty list when no new lines. `503` on source failure.
  - `sincePollAt` defaults to "now - 10s" when absent.
- `GET .../logs/search`:
  - Resolves source → calls `Search` with `range` + `query`.
  - Empty list when no match.
- Old `GET .../logs` continues to return empty (deferred cleanup).

Notes: depends on `backend-logs-interface`. Reuses the existing namespace + label-selector helpers.
