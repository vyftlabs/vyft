// CPU is millicores. Memory/size is bytes.

const BINARY: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
};
const DECIMAL: Record<string, number> = {
  k: 1000,
  M: 1000 ** 2,
  G: 1000 ** 3,
  T: 1000 ** 4,
};

export function parseBytes(input: string): number {
  const m = input.trim().match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)?$/);
  if (!m) throw new Error(`invalid size: ${input}`);
  const n = parseFloat(m[1]!);
  const unit = m[2];
  if (!unit) return Math.round(n);
  const mult = BINARY[unit] ?? DECIMAL[unit];
  if (!mult) throw new Error(`unknown unit: ${unit}`);
  return Math.round(n * mult);
}

export function formatBytes(bytes: number): string {
  for (const [unit, mult] of [
    ["Ti", BINARY.Ti!],
    ["Gi", BINARY.Gi!],
    ["Mi", BINARY.Mi!],
    ["Ki", BINARY.Ki!],
  ] as const) {
    if (bytes >= mult && bytes % mult === 0) return `${bytes / mult}${unit}`;
  }
  return `${bytes}`;
}

export function parseCpu(input: string): number {
  const s = input.trim();
  if (s.endsWith("m")) return Math.round(parseFloat(s.slice(0, -1)));
  return Math.round(parseFloat(s) * 1000);
}

export function formatCpu(millicores: number): string {
  if (millicores % 1000 === 0) return `${millicores / 1000}`;
  return `${millicores}m`;
}
