# Backend: data source resolver
Resolve the active data source for a domain from DB, returning a constructed `DataSource`.

Acceptance:
- `internal/datasource/resolver.go`:
  - `Resolve(ctx, domain) (DataSource, error)` reads `data_source_defaults.{domain}` → `data_sources` row, builds the typed `DataSource` per `kind`, returns `nil` when no default set.
  - `ResolveMetrics(ctx) (MetricsCapable, error)` convenience that resolves the `metrics` domain and casts.
- Decrypts `auth_encrypted` (passthrough w/ TODO matching `registries`).
- Constructs metrics-server or Prometheus data source per row `kind`.
- No caching v1 — read DB every call (cheap; revisit if hot).

Notes: depends on `db-data-sources`, `backend-metrics-server`, `backend-prometheus`.
