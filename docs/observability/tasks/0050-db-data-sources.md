# DB: data_sources + defaults tables
Migration and sqlc queries for the generic data source store and per-domain defaults.

Acceptance:
- Migration `00007_data_sources.sql`:
  - `data_sources` table: `id`, `kind` (enum: `prometheus`, `metrics_server`; extensible), `name`, `config jsonb`, `auth_encrypted bytea`, `created`, `updated`.
  - `data_source_defaults` table: `domain` (PK; enum: `metrics`; extensible), `data_source_id` FK → `data_sources.id` ON DELETE RESTRICT.
- `touch_updated` trigger wired on `data_sources`.
- sqlc queries:
  - `ListDataSources`, `GetDataSource`, `CreateDataSource`, `UpdateDataSource`, `DeleteDataSource`.
  - `GetDataSourceDefault`, `SetDataSourceDefault`.
- Generated Go compiles.

Notes: `auth_encrypted` uses passthrough-with-TODO matching `registries.password_encrypted`. v1 only stores at most one row of kind `prometheus` and at most one row of kind `metrics_server`, but the schema does not enforce that — handled in the application layer.
