const UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function durationToMs(duration: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration: ${duration}`);
  }
  const value = Number.parseFloat(match[1] ?? "");
  const unitKey = match[2] ?? "";
  const unit = UNITS[unitKey];
  if (unit === undefined) {
    throw new Error(`Invalid duration unit: ${unitKey}`);
  }
  return value * unit;
}

export function durationToNanos(duration: string): number {
  return durationToMs(duration) * 1_000_000;
}

export function nanosToDigits(nanos: number): string {
  const ms = nanos / 1_000_000;
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s}s`;
  const m = s / 60;
  return `${m}m`;
}
