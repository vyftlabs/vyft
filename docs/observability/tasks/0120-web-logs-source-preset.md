# Web: Loki + kube-logs presets in sources settings
Surface both log source kinds as configurable in the existing settings page.

Acceptance:
- `lib/source-presets.ts` gains two entries:
  - `loki` — name "Loki", blurb "Streaming + range search via LogQL", icon `ScrollTextIcon`.
  - `kubeLogs` — name "Kubernetes", blurb "Built-in pod logs; tail only.", icon `ServerIcon`.
- Preset entries also carry a `domain: "metrics" | "logs"` field so the picker can filter by section.
- `pages/sources/index.tsx`:
  - Metrics section filters to `domain === "metrics"`.
  - New Logs section filters to `domain === "logs"`, same `<List>` + Add dialog shape.
  - Picker in the Add dialog filters presets by which section opened it.
- Add dialog form variants:
  - `loki`: URL + Auth picker (none / basic / bearer) — same as Prometheus.
  - `kubeLogs`: no fields, confirmation copy only — same as metricsServer.
- "Configure logs" CTA from a disabled logs panel deep-links to `/settings/sources` (anchor `#logs` optional).

Notes: depends on `spec-logs-models` (both kinds in `SourceKind`).
