# Web: logs query wrappers
Extend `src/lib/api/observability.ts` with logs queries.

Acceptance:
- `logsCapabilities(projectId, resourceId)` queryOptions (5-min stale).
- `logsTail(projectId, resourceId)` queryOptions:
  - Polls every 2s (`refetchInterval`).
  - Tracks `sincePollAt`; merges new lines into prev via structuralSharing, cap N (~2000 lines).
- `logsSearch(projectId, resourceId, range, query)` queryOptions (no auto-poll).
- Source mutations (create/patch/remove/promote) already invalidate the metrics capabilities query — extend to also invalidate `logsCapabilities`.
