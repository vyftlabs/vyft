# Web: Loki preset in sources settings
Surface Loki as a configurable source in the existing settings page.

Acceptance:
- `lib/source-presets.ts` gains a Loki entry: id `loki`, name `Loki`, blurb "Streaming + range search for pod logs.", icon `LogsIcon` (lucide).
- `pages/sources/index.tsx`:
  - Metrics section filters to `domain === "metrics"` (already does).
  - Add a Logs section with `domain === "logs"` filter, same `<List>` + Add dialog shape.
  - Picker filters presets by intended domain (could lift `domain` into preset metadata; preset list passes through).
- Add dialog form for Loki uses the same URL + Auth picker as Prometheus (config shape identical).
- "Configure logs" CTA from a disabled logs panel deep-links to `/settings/sources` (parameter or anchor optional).

Notes: depends on `spec-logs-models` (Loki kind exists in `SourceKind` union; form covers it).
