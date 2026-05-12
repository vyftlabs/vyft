# Metrics

## Purpose
Operator sees workload performance per service. Provider is configurable; UI adapts to what it supports.

## Metric kinds

| Kind | Shows | Unit | Chart | Use |
|---|---|---|---|---|
| CPU | CPU usage | millicores, auto-scaled to cores >1000m | line | capacity, throttling |
| Memory | memory usage | bytes, auto-scaled (KiB, MiB, GiB) | line | OOM, leaks, sizing |
| Request rate | traffic volume | req/s | line | traffic drops, deploy verify |
| Error rate | errored request share | percent | line | spike detection, error-budget |
| Latency | p50/p95/p99 of request latency | time, auto-scaled (ms, s) | overlaid lines | regressions hidden by averages |
| Service graph | service call graph; edges weighted by traffic, colored by error rate | req/s + error % on edges | node-edge | blast radius, unexpected callers |

## Providers

| Provider | Supports | Note |
|---|---|---|
| Prometheus | CPU, Memory, Request rate, Error rate, Latency, Service graph | depends on instrumentation deployed |
| metrics-server | CPU, Memory | built-in, resource-only |

## Disabled state
- Disabled panel renders in the same slot, same dimensions as enabled. No layout reflow.
- Muted background, full-contrast title, one-line reason text, "Configure" button.
- Reason text generic: "Configure metrics provider".
- Button always navigates to workspace settings → metrics section.
- Visually distinct from loading (skeleton), empty-data ("no data" centered), error (error icon + retry).

## Outcomes
- Operator picks a provider per workspace.
- Provider declares which kinds it supports.
- All panels render; unsupported kinds disabled.
- Provider change updates panel states on next view.
- Time range selectable.

## Choices
- Provider drives panel state, not operator. State cannot drift from reality.
- Disable unsupported, never hide. Discoverable + stable layout + single render path.
- One disabled treatment, one reason text, one CTA target. Same render path whether 1 or all 6 panels disabled. No regime switching.
- Error rate as percent, not absolute count. Comparable across traffic levels; raw count misleads when load varies.

## Gaps
- Provider support — system-probe, operator-declare, or both?
- Time range — global or per panel?
- Drilldown to per-pod — same tab or new view?
