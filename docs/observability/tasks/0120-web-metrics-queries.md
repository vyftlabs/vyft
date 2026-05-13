# Web: metrics + source query wrappers
Extend `src/lib/api/observability.ts` with capability + per-kind queries, plus `src/lib/api/sources.ts` for source CRUD.

Acceptance:
- `metricsCapabilities(projectId, resourceId)` queryOptions, 5-minute stale.
- `metricsByKind(projectId, resourceId, kind, range)` queryOptions for each kind.
- Source wrappers:
  - `sources.list()` queryOptions.
  - `sources.create / patch / remove` mutationOptions.
  - `sources.promoteDefault(id)` mutationOptions (hits `PUT /sources/{id}/default`).
- Ring-buffer helper: when response is length-1 (metrics-server), merge new point onto previous query data, cap at N samples (~960 = 4h @ 15s). Implemented via react-query `select` or `dataUpdater`.
- Any source mutation invalidates the metrics capabilities query.
