# Logs

## Purpose
Operator sees log lines from a service's pods in the service view. Source is configurable; UI adapts to what is detected at runtime.

## Capabilities

| Capability | Shows |
|---|---|
| live tail | Streaming or near-real-time lines from running pods. |
| search | Look back over a time range with a free-text query filter. |
| level filter | Filter by detected log level (info / warn / error / debug). |

Not every source supports all three. Capability set is per-source-kind (ceiling) and runtime-detected (availability).

## Sources

| Kind | Ceiling | Note |
|---|---|---|
| Loki | live tail, search, level filter | Full LogQL via Grafana Loki HTTP API. |
| Kubernetes | live tail, level filter | Direct pod logs via the kube API. No search — kube API doesn't index. |

Operator picks one source for the `logs` domain. Same domain-default mechanism the metrics vertical already exposes via the `sources` table.

## Panel states

A log panel resolves to one of these states:

| State | When | Render |
|---|---|---|
| disabled — none | No logs source configured | muted panel, "Configure logs source" → settings |
| disabled — unreachable | Source probe failed | muted panel, "Logs source unreachable" → settings |
| live tail | Source connected, lines streaming | list of lines, newest at bottom |
| empty | Source connected, no lines in range | "No logs in selected range" placeholder |
| loading | Initial connect / refresh | skeleton |
| error | Source query failed | error icon + retry |

## Outcomes
- Operator configures one logs source globally; UI adapts.
- Live tail follows running pods; new lines append at the bottom.
- Search query + range selector reveal historical lines (when source supports it).
- Level filter chips toggle which severities show.
- Log line shows: timestamp, level, message. Message is monospaced.
- Severity coloring: error → red, warn → yellow, info → muted, debug → faded.
- Per-source detection mirrors metrics — runtime probe at capability fetch.

## Choices
- One source for the `logs` domain. Multiple stored, one default — same shape as metrics.
- Levels parsed from the log line at display time (regex / heuristics), not at source. Loki doesn't tag level; lines are raw text. UI does best-effort extraction.
- Live tail uses polling, not SSE/WebSocket. Polling cadence per spec (default 2s for tail, 5s otherwise). SSE simpler later but adds connection lifecycle for v1.
- Search returns last N lines (cap 1000 / page). Pagination is "load older."
- No structured logs v1. Plain text only. JSON parsing deferred — pretty common in real logs but additive.
- Severity heuristic: keyword scan on each line (case-insensitive). Conservative — only mark "error" / "warn" when keyword is clear.

## Gaps
- Multi-line log entries (stack traces) — render as one entry or fold?
- Per-container vs aggregated-per-pod when multi-container pods exist.
- Live tail backpressure when log rate is huge.
- Time range UI scope (global per drawer, or per panel).
- Source-specific query syntax exposure (LogQL passthrough vs vyft-flavored).
- Persist filter state across drawer reopens?
