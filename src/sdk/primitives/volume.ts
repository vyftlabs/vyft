import type { Volume, VolumeConfig } from "../../resource.ts";
import { validateId } from "../../resource.ts";

/**
 * Create a persistent volume.
 *
 * @example
 * ```ts
 * volume("data")
 * volume("logs", { size: "10Gi" })
 * ```
 */
export function volume(id: string, config: VolumeConfig = {}): Volume {
  validateId(id);
  return { kind: "volume", id, config };
}
