/**
 * Lifecycle handler types — local copy to avoid circular dep through provider.
 * These match the interface from @vyft/provider.
 */

export interface ResourceId {
  readonly internal: string;
  readonly externalId?: string;
}

export interface HandlerResult<O> {
  externalId?: string;
  output: O;
}

type MaybePromise<T> = T | Promise<T>;

export interface LifecycleHandlers<I, O, Ctx> {
  create(args: {
    id: ResourceId;
    input: I;
    ctx: Ctx;
  }): MaybePromise<HandlerResult<O> | O>;

  read?(args: {
    id: ResourceId;
    ctx: Ctx;
  }): MaybePromise<HandlerResult<O> | O | null>;

  update?(args: {
    id: ResourceId;
    input: I;
    ctx: Ctx;
  }): MaybePromise<HandlerResult<O> | O>;

  delete?(args: { id: ResourceId; ctx: Ctx }): MaybePromise<void>;

  diff?(args: {
    id: ResourceId;
    input: I;
    previousOutput: O;
  }): MaybePromise<"create" | "update" | "recreate">;
}
