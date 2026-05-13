# Backend: data source CRUD + default selectors
Handlers for generic `/data-sources` CRUD and per-domain default.

Acceptance:
- `GET /data-sources`: list all rows (auth stripped).
- `POST /data-sources`: validates `config` shape matches `kind`; encrypts auth (passthrough TODO); returns row.
- `PATCH /data-sources/{id}`: partial update; same validation + encryption.
- `DELETE /data-sources/{id}`: 204. Refuses (409) when the row is referenced by `data_source_defaults`.
- `GET /data-source-defaults/metrics`: returns the data source set as the metrics default, or `null`.
- `PUT /data-source-defaults/metrics`: body `{ dataSourceId }`. Validates the referenced row exists and its `kind` is in the allowed set for metrics (`prometheus`, `metricsServer`).
- Response models never include raw auth secrets.
- Mutations invalidate the metrics capabilities cache.

Notes: depends on `db-data-sources`, `spec-metrics-routes`.
