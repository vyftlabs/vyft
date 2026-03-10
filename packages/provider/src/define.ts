import { type Handlers, RESOURCE, type ResourceDefinition } from "@vyft/core";

export function defineResource<TInput, TOutput = unknown, TCtx = unknown>(
  name: string,
  handlers: Handlers<TInput, TCtx, TOutput>,
): ResourceDefinition<TInput, TOutput, TCtx> {
  return { [RESOURCE]: true, name, handlers };
}
