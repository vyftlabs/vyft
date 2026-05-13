# Backend: logs interface + resolver hook
Define the `LogsCapable` sub-interface alongside `MetricsCapable`, plus a resolver convenience.

Acceptance:
- `internal/source/logs.go`: `LogsCapable` interface embeds `Source` and exposes `Supports() []LogCapability`, `Tail(...)`, `Search(...)`, `Probe(ctx)` (cheap reachability check).
- `LogLine` (Go internal): `{ Time, Level, Message, Pod, Container }`.
- `LogCapability` constants matching openapi enum.
- `internal/source/resolver/resolver.go`: `ResolveLogs(ctx)` mirrors `ResolveMetrics`.
- Loki impl (story 0050) satisfies `LogsCapable`.

Notes: minor refactor — `Source` interface stays kind/id only; `MetricsCapable` and `LogsCapable` are independent capability surfaces. A future source could implement both.
