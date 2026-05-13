# Backend: metrics-server data source
Define the generic `DataSource` interface + `MetricsCapable` sub-interface, and implement metrics-server.

Acceptance:
- New package `internal/datasource/` with:
  - `datasource.go`: `DataSource` interface (`ID()`, `Kind()`).
  - `metrics.go`: `MetricsCapable` sub-interface (`Supports() []MetricKind`, `ProbeMetricNames(MetricKind) []string`, `Query(ctx, kind, ResourceSelector, Range) (Series, error)`).
  - `kind.go`: `MetricKind` constants matching spec enum.
  - `range.go`: `Range` type, `Parse`, `Duration`, `Step`.
  - `selector.go`: `ResourceSelector` helper builds `{namespace, podLabelSelector}` from project/resource ids.
  - `series.go`: shared `Series`/`LatencyPoint` types and conversions to openapi types.
- `internal/datasource/metricsserver/metricsserver.go`: constructor takes `kubernetes.Interface` + metrics-client.
- `Kind() = "metrics_server"`, `Supports() = [cpu, memory]`.
- `ProbeMetricNames(kind) = nil` for all kinds — metrics-server detection is static (always-on for CPU/Memory when reachable). Capability handler treats `nil` as "statically detected".
- `Query` returns single instantaneous point (length-1 series). Aggregates across pods of resource.
- Unit test against fake clientset.

## Validated API contract

Validated against a real `metrics-server` in the local kind cluster (`vyft-demo-production/nginx`).

```
GET /apis/metrics.k8s.io/v1beta1/namespaces/{namespace}/pods?labelSelector=vyft.dev/resource={resource}
```

Returns `PodMetricsList`. Sample item:

```json
{
  "metadata": {
    "name": "nginx-5c76f97d5f-q9gkw",
    "namespace": "vyft-demo-production",
    "labels": { "vyft.dev/resource": "nginx", "vyft.dev/project": "demo", ... }
  },
  "timestamp": "2026-05-13T00:30:55Z",
  "window": "19.149s",
  "containers": [
    { "name": "nginx", "usage": { "cpu": "0", "memory": "36140Ki" } }
  ]
}
```

CPU + memory are `resource.Quantity` strings (`<n>n|m`, `<n>Ki|Mi|Gi`). Use Go client `Quantity.MilliValue()` / `.Value()`.

## Go client

```go
import (
  metricsclientset "k8s.io/metrics/pkg/client/clientset/versioned"
  metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

mcs := metricsclientset.NewForConfigOrDie(cfg)
list, err := mcs.MetricsV1beta1().PodMetricses(ns).List(ctx, metav1.ListOptions{
  LabelSelector: "vyft.dev/resource=" + resource,
})
```

## Aggregation (locked)

For one resource at one instant:
- Per pod: `cpu_pod = Σ containers[].usage.cpu` (millicores), `mem_pod = Σ containers[].usage.memory` (bytes).
- Per resource: `cpu_total = Σ pods[].cpu_pod`, `mem_total = Σ pods[].mem_pod`.
- Return as length-1 `Series` with timestamp = now (or `PodMetrics.timestamp` if preferred).

## Notes

- `window` field on each item (~15-20s) tells the sample window the value represents. Not exposed to clients; informational only.
- metrics-server must be installed in the cluster. Document as a pre-req in operator docs; not vyft's responsibility to install in v1.
