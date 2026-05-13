# Metrics

## Purpose
Operator sees workload performance per service. The metrics data source is configurable; UI adapts to what is detected at runtime.

## Metric kinds

| Kind | Shows | Unit | Chart | Use |
|---|---|---|---|---|
| CPU | CPU usage | millicores, auto-scaled to cores >1000m | line | capacity, throttling |
| Memory | memory usage | bytes, auto-scaled (KiB, MiB, GiB) | line | OOM, leaks, sizing |
| Request rate | traffic volume | req/s | line | traffic drops, deploy verify |
| Error rate | errored request share | percent | line | spike detection, error-budget |
| Latency | p50/p95/p99 of request latency | time, auto-scaled (ms, s) | overlaid lines | regressions hidden by averages |

## Data sources

| Kind | Ceiling | Note |
|---|---|---|
| Prometheus | CPU, Memory, Request rate, Error rate, Latency | RED + Latency require HTTP server instrumentation |
| metrics-server | CPU, Memory | built-in, resource-only |

Ceiling = what the data source kind *could* offer. Settings page shows it for operator guidance. Actual UI gating is driven by runtime detection (next section), not ceiling.

## Panel states

A panel resolves to one of these states, in priority order:

| State | When | Render | CTA |
|---|---|---|---|
| disabled — none | No data source configured | muted slot, message + button | "Configure metrics" → settings |
| disabled — ceiling | Configured kind outside its ceiling | muted slot | "Configure metrics" → settings |
| disabled — unreachable | Configured data source probe failed | muted slot | "Configure metrics" → settings |
| loading | Initial fetch or refresh | skeleton | — |
| empty-data | Kind detected, no series for this service | placeholder w/ message | "No data — service may not be instrumented" → docs |
| empty-range | Kind detected, service has data elsewhere but none in selected range | placeholder | — |
| live | Query returned points | chart | — |

Rule: **disabled = config-level issue (settings fixes it); empty = data-level issue (instrumentation or range fixes it).**

Single CTA across all disabled states ("Configure metrics") keeps the render path uniform. Message varies by cause; button does not.

## Outcomes
- Operator configures a single metrics data source globally.
- Settings shows each data source kind's ceiling so operator knows what they could get.
- Backend probes the active data source for which kinds are detected at the instance.
- Panels gate on detection result, not ceiling. metrics-server detection is static (CPU, Memory always). Prometheus detection is probe-driven.
- Per-service "no data" is observed from the kind's query result, not a separate probe.
- Data source change re-runs detection on next capability fetch.
- Time range selectable.

## Choices
- Static ceiling vs runtime detection are separate concerns. Ceiling = settings copy; detection = panel gating.
- Single combined probe (one Prom query w/ `__name__` regex) instead of per-kind probes. One round-trip.
- Probe scoped to instance, not per-service. Per-service handled via empty-data state from query result. Avoids N-services × kinds probe fan-out.
- Disable unsupported, never hide. Discoverable + stable layout.
- One disabled CTA ("Configure metrics") across all causes. Message varies, button does not. Single render path.
- Error rate as percent, not absolute count. Comparable across traffic levels; raw count misleads when load varies.
- OTel semantic conventions are the canonical contract for RED metric names. Legacy `http_requests_total` accepted as a fallback during probe.
- Generic `data sources` abstraction underneath, exposed in v1 only as "Metrics" inside a Data sources settings page. Future verticals (logs, traces) and per-service overrides reuse the same substrate.

## Gaps
- Time range — global or per panel?
- Drilldown to per-pod — same tab or new view?
- Histogram vs summary instrumentation — v1 assumes histogram for latency.
- Instrumentation addons (Beyla, OTel SDK auto-instrument) — out of scope v1; addressed as a separate vertical.
