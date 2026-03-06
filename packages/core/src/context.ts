import type { Store } from "@vyft/store";
import type { Provider } from "./provider.ts";
import type { Artifacts } from "./resource.ts";

export interface Context {
  store: Store;
  providers: Record<string, Provider<unknown>>;
  createArtifacts(urn: string): Artifacts;
}
