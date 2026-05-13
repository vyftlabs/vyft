# DB: add `logs` domain + `loki` / `kube_logs` source kinds
Migration extending the existing `source_domain` + `source_kind` enums.

Acceptance:
- Migration `00008_logs.sql`:
  - `ALTER TYPE source_domain ADD VALUE 'logs';`
  - `ALTER TYPE source_kind ADD VALUE 'loki';`
  - `ALTER TYPE source_kind ADD VALUE 'kube_logs';`
- sqlc regen picks up the new enum values.
- Existing CRUD queries continue to work; no shape change.
- Partial unique index (`one default per domain`) extends naturally — Postgres treats new enum values transparently.

Notes: no Go code changes beyond regenerated enum constants.
