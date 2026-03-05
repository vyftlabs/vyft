import { parseURN } from "@vyft/primitives";
import type { EncryptedPayload, ResourceState } from "@vyft/store";
import { decrypt } from "@vyft/store";

/** Build a secret map from variable ResourceStates in state. */
export function buildSecretMap(
  state: Iterable<ResourceState>,
  passphrase: string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const rs of state) {
    try {
      const parsed = parseURN(rs.urn);
      if (parsed.resource !== "variable") continue;
    } catch {
      continue;
    }
    const { id } = parseURN(rs.urn);
    const raw = rs.outputs["value"];
    if (raw === undefined) continue;

    if (rs.sensitive?.includes("value")) {
      map.set(id, decrypt(raw as EncryptedPayload, passphrase));
    } else {
      map.set(id, raw as string);
    }
  }
  return map;
}
