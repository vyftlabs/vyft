# Cleanup: deprecated logs endpoint
Remove the legacy `GET /projects/{projectId}/resources/{resourceId}/logs` once the new tail + search are wired everywhere.

Acceptance:
- `packages/spec/src/paths/observability.ts`: drop the legacy logs route.
- `internal/observability/handler.go`: drop `ListResourceLogs`.
- `apps/web/src/lib/api/observability.ts`: drop the legacy `logs(...)` wrapper.
- Web search confirms no remaining callers of the legacy endpoint.
- `pnpm spec:gen`, `go test`, web build all pass.

Notes: blocked by `web-logs-panel` (panel must be on the new tail path before removing the legacy fallback).
