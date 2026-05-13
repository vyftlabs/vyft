# Backend: source CRUD + default selectors
Handlers for generic `/sources` CRUD and per-domain default.

Acceptance:
- `GET /sources`: list all rows (auth stripped).
- `POST /sources`: validates `config` shape matches `kind`; encrypts auth (passthrough TODO); returns row.
- `PATCH /sources/{id}`: partial update; same validation + encryption.
- `DELETE /sources/{id}`: 204. Refuses (409) when the row is referenced by `source_defaults`.
- `GET /source-defaults/metrics`: returns the source set as the metrics default, or `null`.
- `PUT /source-defaults/metrics`: body `{ sourceId }`. Validates the referenced row exists and its `kind` is in the allowed set for metrics (`prometheus`, `metricsServer`).
- Response models never include raw auth secrets.
- Mutations invalidate the metrics capabilities cache.

Notes: depends on `db-sources`, `spec-metrics-routes`.
