# Backend: resolver + server wiring for logs
Hook the Loki source into the resolver and route it through the observability handler.

Acceptance:
- `internal/source/resolver/resolver.go`: `build()` switch grows a `sqlc.SourceKindLoki` arm that returns a `loki.Loki`.
- `internal/server/aggregate.go`: no signature change — resolver already constructed.
- Observability handler service struct holds the resolver (already there); new logs methods read `res.ResolveLogs(ctx)`.

Notes: small touch — the existing wiring covers it.
