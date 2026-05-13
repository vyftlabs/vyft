# Backend: source CRUD
Handlers for `/sources` CRUD and the promote-default endpoint.

Acceptance:
- `GET /sources`: list rows (auth stripped).
- `POST /sources`: validates `config` shape matches `kind`; encrypts auth (passthrough TODO); creates row. If no other source exists in the new row's domain, the new row is auto-marked `is_default=true`. Otherwise it lands `is_default=false` and operator promotes explicitly.
- `PATCH /sources/{id}`: partial update on `name`, `config`, `auth_encrypted`. Cannot change `kind` or `domain` — operator deletes + recreates if needed.
- `DELETE /sources/{id}`: 204. If the row was `is_default=true`, the domain is left with no default until the operator picks the next one.
- `PUT /sources/{id}/default`: promotes this row to default for its domain. Backend runs `SetDefaultSource(id, domain)` (single SQL UPDATE that flips `is_default` for all rows in the domain atomically). Returns the promoted row.
- Response models never include raw auth secrets.
- Mutations invalidate the metrics capabilities cache.

Notes: depends on `db-sources`. Source rows carry `domain` and `is_default`; partial unique index in the migration enforces at most one default per domain.
