// Memory/disk size in megabytes. CPU in fractional cores.

export function formatMb(mb: number): string {
  const gib = mb / 1024;
  if (gib >= 1) return `${Number.isInteger(gib) ? gib : gib.toFixed(1)}Gi`;
  return `${mb}Mi`;
}

export function formatCores(cores: number): string {
  if (cores >= 1)
    return `${Number.isInteger(cores) ? cores : cores.toFixed(2)} core${cores > 1 ? "s" : ""}`;
  return `${Math.round(cores * 1000)}m`;
}
