# Backend: server wiring
Construct data source components in `internal/server/server.go` and inject into the observability + data source handlers.

Acceptance:
- k8s metrics client built from kubeconfig alongside existing kube clients.
- `datasource.Resolver` instantiated with db + clients.
- Observability handler and data source CRUD handler receive the resolver via constructor.
- Smoke test: empty DB + no metrics default → `GET .../metrics/capabilities` returns `{ dataSourceKind: null, detected: [] }`.

Notes: depends on `backend-data-source-resolver`, `backend-metrics-endpoints`, `backend-data-source-crud`.
