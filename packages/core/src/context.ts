import type { Store } from "@vyft/store";

import type { Provider } from "./provider.ts";
import type { Artifacts } from "./resource.ts";
import type { Cipher } from "./secret.ts";

export interface Context {
  store: Store;
  cipher: Cipher;
  providers: Record<string, Provider<unknown>>;
  createArtifacts(urn: string): Artifacts;
}
