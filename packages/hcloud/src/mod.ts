/**
 * Hetzner Cloud platform initialization.
 *
 * @example
 * ```ts
 * import { t } from "./mod.ts";
 * import { server } from "./server.ts";
 * import { volume } from "./volume.ts";
 *
 * export default t.define({ server, volume });
 * ```
 */

import { initPlatform } from "@vyft/platform";

import { createClient } from "./client.ts";

export interface HcloudContext {
  client: ReturnType<typeof createClient>;
}

export const t = initPlatform({
  name: "hcloud",
  setup: (): HcloudContext => {
    const apiToken = process.env["HCLOUD_API_TOKEN"];
    if (!apiToken) {
      throw new Error("HCLOUD_API_TOKEN environment variable is required");
    }
    return { client: createClient(apiToken) };
  },
});

const LABEL_KEY = "vyft.dev/resource/id";

export function resourceLabels(id: string): Record<string, string> {
  return { [LABEL_KEY]: id };
}

export function labelSelector(id: string): string {
  return `${LABEL_KEY}=${id}`;
}
