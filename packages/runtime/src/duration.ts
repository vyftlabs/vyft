/** Duration units and their multiplier to milliseconds. */
const UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
};

/** Parse a validated duration string (e.g. "10s") to milliseconds. */
export function durationToMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h)$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const unit = match[2];
  if (!unit) throw new Error(`Invalid duration: ${value}`);
  const multiplier = UNITS[unit];
  if (multiplier === undefined)
    throw new Error(`Unknown duration unit: ${unit}`);
  return Number(match[1]) * multiplier;
}

/** Parse a validated duration string to nanoseconds (Docker/Swarm API). */
export function durationToNanos(value: string): number {
  return durationToMs(value) * 1_000_000;
}

/** Parse a validated duration string to seconds (K8s API). */
export function durationToSeconds(value: string): number {
  return Math.ceil(durationToMs(value) / 1_000);
}

/** Convert nanoseconds back to a human duration string. */
export function nanosToDigits(nanos: number): string {
  if (nanos === 0) return "0s";
  if (nanos % 3_600_000_000_000 === 0) return `${nanos / 3_600_000_000_000}h`;
  if (nanos % 60_000_000_000 === 0) return `${nanos / 60_000_000_000}m`;
  if (nanos % 1_000_000_000 === 0) return `${nanos / 1_000_000_000}s`;
  return `${nanos / 1_000_000}ms`;
}
