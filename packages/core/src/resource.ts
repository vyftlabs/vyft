import type { Dependable } from "@vyft/engine";
import type { z } from "zod";
import type { Provider } from "./provider.ts";
import type { URN } from "./urn.ts";
import { urn } from "./urn.ts";

export interface ResourceRef<T = unknown> {
  urn: URN;
  readonly _type?: T;
}

export interface ResourceOptions {
  dependsOn?: Dependable[];
}

export interface ResourceEntry<T = unknown> extends ResourceRef<T> {
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
  ctx: TCtx;
  artifacts: Artifacts;
}

export interface UpdateArgs<TInput, TCtx> {
  input: TInput;
  old: unknown;
  ctx: TCtx;
  artifacts: Artifacts;
}

export interface DiffArgs<TInput> {
  old: TInput;
  new: TInput;
  artifacts: Artifacts;
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
  schema: z.ZodType<TInput>;
  handlers: Handlers<TInput, TCtx>;
}

export function resource<C, T extends Record<string, unknown>>(
  providerName: string,
  providerInstance: Provider<unknown>,
  type: string,
  define: (id: string, config: C) => T,
): {
  (id: string, config: C, options?: ResourceOptions): ResourceEntry<T>;
  (id: string): ResourceRef<T>;
} {
  return ((id: string, config?: C, options?: ResourceOptions) => {
    const resourceUrn = urn.build("resource", providerName, type, id);

    if (config === undefined) {
      return { urn: resourceUrn } satisfies ResourceRef<T>;
    }

    const value = define(id, config);
    const entry: ResourceEntry<T> = {
      urn: resourceUrn,
      value,
      provider: providerInstance,
    };
    if (options?.dependsOn) {
      entry.dependsOn = options.dependsOn;
    }
    return entry;
  }) as {
    (id: string, config: C, options?: ResourceOptions): ResourceEntry<T>;
    (id: string): ResourceRef<T>;
  };
}
