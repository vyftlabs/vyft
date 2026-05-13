# Spec: logs models
Add zod models for logs capability + line shape.

Acceptance:
- `LogCapability` enum: `tail | search | level`.
- `LogLevel` enum: `error | warn | info | debug | unknown`.
- Extend existing `LogLine` (or replace) with: `timestamp`, `level: LogLevel`, `message`, optional `pod`, optional `container`.
- `LogsCapabilities`: `{ sourceKind: SourceKind | null, detected: LogCapability[] }`.
- `LogSearchParams`: `{ range: MetricRange, query?: string, limit?: number }` (reuse `MetricRange` enum).
- `LogTailParams`: `{ sincePollAt?: ISO datetime, limit?: number }`.
- Exported constant `LogsCeiling: Record<SourceKind, LogCapability[]>` — same shape as `MetricsCeiling`.
- Add `loki` AND `kubeLogs` to `SourceKind` enum.
- Add `logs` to `SourceDomain` enum.
- `LokiConfig` = `{ url, auth }` (reuse `SourceAuth`).
- `KubeLogsConfig` = `{}` (no config — always-on when backend has cluster access; mirrors `MetricsServerConfig`).
- `SourceCreate` discriminated union gains both `loki` and `kubeLogs` variants.
- `LogsCeiling` entries:
  - `loki → [tail, search, level]`
  - `kubeLogs → [tail, level]` (no search)

Notes: `SourceKind` already covers prometheus + metricsServer. Adding `loki` means the existing settings UI lists Loki under sources too — `sourcePresets` gets a Loki entry.
