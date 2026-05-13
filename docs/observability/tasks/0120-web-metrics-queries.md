# Web: metrics + data source query wrappers
Extend `src/lib/api/observability.ts` with capability + per-kind queries, plus `src/lib/api/data-sources.ts` for data source CRUD.

Acceptance:
- `metricsCapabilities(projectId, resourceId)` queryOptions, 5-minute stale.
- `metricsByKind(projectId, resourceId, kind, range)` queryOptions for each kind.
- Data source wrappers:
  - `dataSources.list()` queryOptions.
  - `dataSources.create / patch / remove` mutationOptions.
  - `dataSourceDefaults.metrics.get()` queryOptions.
  - `dataSourceDefaults.metrics.set(dataSourceId)` mutationOptions.
- Ring-buffer helper: when response is length-1 (metrics-server), merge new point onto previous query data, cap at N samples (~960 = 4h @ 15s). Implemented via react-query `select` or `dataUpdater`.
- Any data source mutation invalidates the metrics capabilities query.
