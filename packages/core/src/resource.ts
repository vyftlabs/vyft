import { DEPENDABLE, type Dependable, LINKABLE } from "@vyft/engine";
import type { Provider } from "./provider.ts";
import type { URN } from "./urn.ts";
import { urn } from "./urn.ts";

export const RESOURCE: unique symbol = Symbol("vyft.resource");

export interface ResourceRef<T = unknown> {
  urn: URN;
  readonly _type?: T;
}

export interface ResourceOptions {
  dependsOn?: Dependable[];
}

export interface ResourceEntry<T = unknown> extends ResourceRef<T> {
  [DEPENDABLE]: true;
  [LINKABLE]: true;
  value: Record<string, unknown>;
  dependsOn?: Dependable[];
  provider: Provider<unknown>;
}

export type HandlerName = "create" | "read" | "update" | "delete" | "diff";

export interface ArtifactRef {
  key: string;
}

export interface Artifacts {
  write(name: string, data: string | Buffer): Promise<ArtifactRef>;
  read(ref: ArtifactRef): Promise<Buffer>;
  exists(ref: ArtifactRef): Promise<boolean>;
  delete(ref: ArtifactRef): Promise<void>;
}

export interface HandlerArgs<TInput, TCtx> {
  input: TInput;
  ctx: TCtx & { artifacts: Artifacts };
}

export interface UpdateArgs<TInput, TCtx> {
  input: TInput;
  old: unknown;
  ctx: TCtx & { artifacts: Artifacts };
}

export interface DiffArgs<TInput> {
  old: TInput;
  new: TInput;
  ctx: { artifacts: Artifacts };
}

export type DiffAction = "update" | "recreate" | "none";

export interface DiffResult {
  action: DiffAction;
  changes?: string[];
}

export interface CreateResult {
  externalId?: string;
  output: Record<string, unknown>;
}

export interface Handlers<TInput, TCtx> {
  create?(args: HandlerArgs<TInput, TCtx>): Promise<CreateResult>;
  read?(args: HandlerArgs<TInput, TCtx>): Promise<Record<string, unknown>>;
  update?(args: UpdateArgs<TInput, TCtx>): Promise<Record<string, unknown>>;
  delete?(args: HandlerArgs<TInput, TCtx>): Promise<void>;
  diff?(args: DiffArgs<TInput>): Promise<DiffResult>;
}

export interface ResourceDefinition<TInput = unknown, TCtx = unknown> {
  [RESOURCE]: true;
  name: string;
  handlers: Handlers<TInput, TCtx>;
}

export function resource<C, T>(
  providerName: string,
  providerInstance: Provider<unknown>,
  type: string,
  define: (id: string, config: C) => T,
): (id: string, config?: C, options?: ResourceOptions) => ResourceEntry<T> {
  return (id: string, config?: C, options?: ResourceOptions) => {
    const resourceUrn = urn.build("resource", providerName, type, id);
    const value = define(id, config ?? ({} as C));
    const entry = {
      [DEPENDABLE]: true,
      [LINKABLE]: true,
      urn: resourceUrn,
      value,
      provider: providerInstance,
    } as ResourceEntry<T>;
    if (options?.dependsOn) {
      entry.dependsOn = options.dependsOn;
    }
    return entry;
  };
}
