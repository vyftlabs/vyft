# Spec: metrics + data source models
Add zod models for metric kinds, capabilities, series, the generic `DataSource`, and the ceiling map.

Acceptance:
- `MetricKind` enum: `cpu | memory | reqRate | errRate | latency`.
- `MetricRange` enum: `15m | 1h | 6h | 24h`.
- `DataSourceKind` enum: `prometheus | metricsServer` (v1; extensible).
- `MetricsCapabilities`: `{ dataSourceKind: DataSourceKind | null, detected: MetricKind[] }`.
- `MetricSeries`: discriminated on `kind`. `latency` carries `LatencyPoint[]`; others carry `RangePoint[]`.
- `DataSourceAuth`: discriminated union — `none` | `basic { username, password }` | `bearer { token }`.
- `DataSourceConfig`: discriminated union — `prometheus { url, auth }` | `metricsServer {}`.
- `DataSource` response model strips secret fields from auth.
- `DataSourceDefaults`: `{ metrics: dataSourceId | null }`. Extensible for future domains (`logs`, `traces`).
- Exported constant `MetricsCeiling: Record<DataSourceKind, MetricKind[]>`:
  - `prometheus → [cpu, memory, reqRate, errRate, latency]`
  - `metricsServer → [cpu, memory]`
- `pnpm spec:gen` runs clean; web + backend compile.
