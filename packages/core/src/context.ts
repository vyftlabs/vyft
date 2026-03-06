import type { Provider } from "./provider.ts";
import type { Artifacts } from "./resource.ts";

export interface Context {
  providers: Record<string, Provider<unknown>>;
  createArtifacts(urn: string): Artifacts;
}
