# Cleanup: deprecated MetricsOverview
Remove the old single-endpoint `MetricsOverview` model and handler.

Acceptance:
- `MetricsOverview` model removed from `packages/spec/src/models/observability.ts`.
- `GET /projects/{projectId}/resources/{resourceId}/metrics` route + handler removed.
- Web has no remaining imports of `MetricsOverview`.
- `pnpm spec:gen`, typecheck, `go test`, lint all pass.

Notes: blocked by `web-overview-gating` (Overview must be on per-kind queries before old endpoint can go).
