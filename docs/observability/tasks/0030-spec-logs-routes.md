# Spec: logs routes
Add per-resource logs capability + tail + search routes.

Acceptance:
- `GET /projects/{projectId}/resources/{resourceId}/logs/capabilities` → `LogsCapabilities`.
- `GET /projects/{projectId}/resources/{resourceId}/logs/tail` → `LogLine[]`. Query: `sincePollAt`, `limit`. Returns lines after `sincePollAt`; backend caps `limit` (default 500).
- `GET /projects/{projectId}/resources/{resourceId}/logs/search` → `LogLine[]`. Query: `range`, `query`, `limit` (default 200, max 1000).
- Existing `GET /projects/{projectId}/resources/{resourceId}/logs` deprecated; left in place until cleanup story.
- `pnpm spec:gen` runs clean.

Notes: depends on `spec-logs-models`. Stub the Go handlers (return empty) so `StrictServerInterface` compiles before real impl lands.
