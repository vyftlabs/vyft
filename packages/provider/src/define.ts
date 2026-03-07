import { type Handlers, RESOURCE, type ResourceDefinition } from "@vyft/core";

export function defineResource<TInput, TCtx = unknown>(
  name: string,
  handlers: Handlers<TInput, TCtx>,
): ResourceDefinition<TInput, TCtx> {
  return { [RESOURCE]: true, name, handlers };
}
