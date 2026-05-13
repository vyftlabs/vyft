# Backend: resolver + server wiring for logs
Hook the Loki + kube-logs sources into the resolver and route them through the observability handler.

Acceptance:
- `internal/source/resolver/resolver.go`: `build()` switch grows arms for both `sqlc.SourceKindLoki` (returns `loki.Loki`) and `sqlc.SourceKindKubeLogs` (returns `kubelogs.KubeLogs`).
- Resolver constructor accepts `cs kubernetes.Interface` alongside the existing metrics client. Threaded into kube-logs construction.
- `internal/server/aggregate.go`: pass the existing `cs` into the resolver.
- Observability handler reads `res.ResolveLogs(ctx)`; no change to handler signature.

Notes: kube-logs needs the in-process kube clientset (same one metricsserver uses for its API). Resolver constructor expands by one arg.
