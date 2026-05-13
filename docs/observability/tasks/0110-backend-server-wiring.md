# Backend: server wiring
Construct source components in `internal/server/server.go` and inject into the observability + source handlers.

Acceptance:
- k8s metrics client built from kubeconfig alongside existing kube clients.
- `source.Resolver` instantiated with db + clients.
- Observability handler and source CRUD handler receive the resolver via constructor.
- Smoke test: empty DB + no metrics default → `GET .../metrics/capabilities` returns `{ sourceKind: null, detected: [] }`.

Notes: depends on `backend-source-resolver`, `backend-metrics-endpoints`, `backend-source-crud`.
