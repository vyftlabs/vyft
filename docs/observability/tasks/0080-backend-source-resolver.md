# Backend: source resolver
Resolve the active source for a domain from DB, returning a constructed `Source`.

Acceptance:
- `internal/source/resolver.go`:
  - `Resolve(ctx, domain) (Source, error)` reads `source_defaults.{domain}` → `sources` row, builds the typed `Source` per `kind`, returns `nil` when no default set.
  - `ResolveMetrics(ctx) (MetricsCapable, error)` convenience that resolves the `metrics` domain and casts.
- Decrypts `auth_encrypted` (passthrough w/ TODO matching `registries`).
- Constructs metrics-server or Prometheus source per row `kind`.
- No caching v1 — read DB every call (cheap; revisit if hot).

Notes: depends on `db-sources`, `backend-metrics-server`, `backend-prometheus`.
