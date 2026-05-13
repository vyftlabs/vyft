# Backend: kube-logs source
Implement Kubernetes pod logs as a `Source` + `LogsCapable`.

Acceptance:
- `internal/source/kubelogs/kubelogs.go`:
  - `Kind() = "kube_logs"`.
  - `Supports() []LogCapability = [tail, level]` — no search; the kube API doesn't index.
  - `Tail(ctx, ResourceSelector, since time.Time, limit int)` — calls `cs.CoreV1().Pods(ns).List(...)` with the label selector, then streams `GetLogs(podName).Stream(ctx)` per pod with `SinceTime: since` and `TailLines: limit`. Aggregates lines across pods, sorts by timestamp.
  - `Search(...) → error`: returns `apierr.BadRequest("kube logs source doesn't support search")` — guarded by `Supports()` so handler should refuse before this fires; defensive.
  - `Probe(ctx)`: `cs.Discovery().ServerVersion()` — cheap reachability check.
- `internal/source/kubelogs/config.go`: `StoredConfig` = empty struct (no URL / auth — uses the in-process kube client).
- Constructor: `New(id uuid.UUID, name string, cs kubernetes.Interface)`.
- Level extraction: same heuristic Loki uses; share the helper from `internal/source/logs.go` (story 0070).
- Unit tests against a fake clientset (mirrors metricsserver test setup).

Notes: parallels `metricsserver` for metrics — same shape, same minimal config. Always available when the backend has cluster access; nil-cs degrades the source to "unavailable" via Probe.
