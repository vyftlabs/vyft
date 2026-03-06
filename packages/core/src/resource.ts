import type { z } from "zod";
import type { URN } from "./urn.ts";

export interface ResourceRef<T = unknown> {
  urn: URN;
  readonly _type?: T;
}

export interface ResourceEntry<T = unknown> extends ResourceRef<T> {
  value: T;
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

export interface Handlers<TInput, TCtx> {
  create?(args: HandlerArgs<TInput, TCtx>): Promise<unknown>;
  read?(args: HandlerArgs<TInput, TCtx>): Promise<unknown>;
  update?(args: UpdateArgs<TInput, TCtx>): Promise<unknown>;
  delete?(args: HandlerArgs<TInput, TCtx>): Promise<void>;
  diff?(args: DiffArgs<TInput>): Promise<DiffResult>;
}

export interface ResourceDefinition<TInput = unknown, TCtx = unknown> {
  schema: z.ZodType<TInput>;
  handlers: Handlers<TInput, TCtx>;
}
