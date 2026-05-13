# Web: Overview sparkline gating + state derivation
Drive each sparkline slot through the panel state machine from `metrics.md`.

Acceptance:
- `useMetricsCapabilities` hook wraps the capabilities query (5-min stale).
- Drawer Overview calls capabilities once and derives each panel's state from: capabilities response, kind-query result, kind-query status.
- State derivation per kind:
  ```
  if capabilities.error === "unreachable"           → disabled (unreachable)
  if capabilities.dataSourceKind == null            → disabled (none)
  if !MetricsCeiling[dataSourceKind].includes(kind) → disabled (ceiling)
  if !capabilities.detected.includes(kind)          → empty-data (service-not-instrumented)
  if kindQuery.isLoading                            → loading
  if kindQuery.error                                → error
  if kindQuery.data.points.length === 0             → empty-data (no-data-in-range)
  else                                              → live
  ```
- Live: existing sparkline component fed by the per-kind query.
- Loading: existing skeleton (already in app).
- Error: existing error state (already in app).
- Disabled/empty: components from `web-disabled-panel`.
- Sparkline polling at 15s.
- No layout reflow between states.

Notes: depends on `web-metrics-queries`, `web-disabled-panel`. Imports `MetricsCeiling` from `@vyft/spec`. Touches `src/components/service/drawer/index.tsx`.
