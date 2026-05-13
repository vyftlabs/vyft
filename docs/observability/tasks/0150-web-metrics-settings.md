# Web: data sources settings page (Metrics section)
Global "Data sources" settings page; v1 contains only the Metrics section.

Acceptance:
- New route `/settings/data-sources` registered in `App.tsx`.
- Nav entry alongside existing global settings (registries pattern). Label: "Data sources".
- Page layout: section header "Metrics" (v1's only section; future sections "Logs", "Traces").
- Metrics section shows:
  - Current data source card (kind, name, summary) with edit + delete — OR "Add metrics data source" CTA when none configured.
  - Add/edit dialog: react-hook-form + `zodResolver(DataSourceConfig)`.
  - Kind picker (`prometheus | metricsServer`) drives the conditional subform:
    - `prometheus`: URL input + auth picker (`none | basic | bearer`) with conditional auth fields.
    - `metricsServer`: no fields, confirmation copy only.
  - Each kind card shows its **ceiling** as static guidance, imported from `MetricsCeiling` in `@vyft/spec`:
    - Prometheus → "Supports: CPU, Memory, Request rate, Error rate, Latency. RED + Latency require HTTP server instrumentation."
    - metrics-server → "Supports: CPU, Memory only."
  - Ceiling is purely informational. Panel gating in the drawer uses runtime detection, not ceiling.
- Save creates/updates the data source AND sets it as the metrics default (single combined action — v1 hides the generic data-source/default split from the operator).
- Save invalidates the metrics capabilities query.

Notes: depends on `spec-metrics-routes`, `backend-data-source-crud`, `web-metrics-queries`. Mirror shell from `pages/registries/index.tsx`. The "Configure metrics" CTA on disabled panels navigates here.
