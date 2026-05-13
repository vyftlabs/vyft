# Spec: data source + metrics routes
Add generic data source CRUD, domain default selectors, per-kind metrics, and capabilities routes.

Acceptance:
- Generic data source CRUD:
  - `GET /data-sources` → `DataSource[]`
  - `POST /data-sources` → `DataSource`
  - `PATCH /data-sources/{id}` → `DataSource`
  - `DELETE /data-sources/{id}` → 204
- Domain default:
  - `GET /data-source-defaults/metrics` → `DataSource | null`
  - `PUT /data-source-defaults/metrics` body `{ dataSourceId }` → `DataSource`
- Per-resource metrics:
  - `GET /projects/{projectId}/resources/{resourceId}/metrics/capabilities` → `MetricsCapabilities`
  - `GET /projects/{projectId}/resources/{resourceId}/metrics/{kind}?range=15m` → `MetricSeries`
- Existing `GET .../metrics` route stays (removed in cleanup story).
- `pnpm spec:gen` runs clean; web + backend compile.

Notes: depends on `spec-metrics-models`.
