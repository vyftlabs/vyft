# Web: panel state components
Reusable components for the non-live panel states: disabled, empty-data, error. Each takes a cause + message; disabled has a uniform CTA.

Acceptance:
- `src/components/service/metrics/disabled-panel.tsx`:
  - Props: `{ cause: "none" | "ceiling" | "unreachable", sourceKind?, kind }`.
  - Muted background, full-contrast title (kind name), one-line message, "Configure metrics" button.
  - Messages by cause:
    - `none` → "No metrics source configured."
    - `ceiling` → `"{sourceKind} doesn't support {kind label}."`
    - `unreachable` → "Metrics source unreachable."
  - Button text is always "Configure metrics". Always navigates to the Sources page (Metrics section).
- `src/components/service/metrics/empty-data-panel.tsx`:
  - Props: `{ cause: "service-not-instrumented" | "no-data-in-range", kind }`.
  - Centered placeholder, distinct visual from disabled (different muted shade or icon).
  - Messages:
    - `service-not-instrumented` → "No data — service may not be instrumented." + link to docs.
    - `no-data-in-range` → "No data in selected range."
  - No CTA button.
- All variants size to fit existing sparkline slot dimensions. No layout reflow.
- Visually distinct from each other and from loading skeleton + error state.

Notes: maps to the Panel states table in `metrics.md`.
