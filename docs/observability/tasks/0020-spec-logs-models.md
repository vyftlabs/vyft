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
- Add `loki` to `SourceKind` enum (drop or keep `metricsServer`? keep — metrics-kind doesn't affect logs).
- Add `logs` to `SourceDomain` enum (extends what backend will read).
- Loki source config: `LokiConfig` = `{ url, auth }` (reuse `SourceAuth`).
- `SourceCreate` discriminated union gains a `loki` variant.

Notes: `SourceKind` already covers prometheus + metricsServer. Adding `loki` means the existing settings UI lists Loki under sources too — `sourcePresets` gets a Loki entry.
