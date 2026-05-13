# Web: logs panel state machine
Replace the current static logs slot in `drawer/shell.tsx` Overview with a capability-driven panel that mirrors metrics.

Acceptance:
- New `src/components/service/logs/panel.tsx`:
  - Reads `useLogsCapabilities`; renders one of: disabled (none / unreachable), live (tail-driven log lines list), empty (no recent lines), loading skeleton, error.
  - Line component shows time + level chip + message; severity coloring matches existing log preview in `drawer/shell.tsx`.
- Drawer Overview's `logs` prop is replaced by a `logsArea?: React.ReactNode` slot (parallel to `metricsArea`). OverviewTab composes `<LogsPanel projectId resourceId />`.
- Existing `logs` query in OverviewTab removed; LogsPanel owns fetching.
- Disabled-panel CTA → `/settings/sources`.

Notes: depends on `web-logs-queries`. Reuses existing log-row CSS pattern.
