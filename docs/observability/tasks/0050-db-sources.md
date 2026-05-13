# DB: sources + defaults tables
Migration and sqlc queries for the generic source store and per-domain defaults.

Acceptance:
- Migration `00007_sources.sql`:
  - `sources` table: `id`, `kind` (enum: `prometheus`, `metrics_server`; extensible), `name`, `config jsonb`, `auth_encrypted bytea`, `created`, `updated`.
  - `source_defaults` table: `domain` (PK; enum: `metrics`; extensible), `source_id` FK → `sources.id` ON DELETE RESTRICT.
- `touch_updated` trigger wired on `sources`.
- sqlc queries:
  - `ListSources`, `GetSource`, `CreateSource`, `UpdateSource`, `DeleteSource`.
  - `GetSourceDefault`, `SetSourceDefault`.
- Generated Go compiles.

Notes: `auth_encrypted` uses passthrough-with-TODO matching `registries.password_encrypted`. v1 only stores at most one row of kind `prometheus` and at most one row of kind `metrics_server`, but the schema does not enforce that — handled in the application layer.
