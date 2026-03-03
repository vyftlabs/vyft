/**
 * Hetzner Cloud platform.
 *
 * @example
 * ```ts
 * import hcloud from "@vyft/hcloud";
 *
 * const target = { platform: hcloud, runtime: docker };
 * ```
 */

import { t } from "./mod.ts";
import { server } from "./server.ts";
import { volume } from "./volume.ts";

export default t.define({ server, volume });

export { createClient } from "./client.ts";
export type { HcloudContext } from "./mod.ts";
