/**
 * Provider context — holds the provider name, required secrets,
 * and a setup function that produces the runtime context (e.g. an API client).
 */
export type ProviderContext<
  N extends string = string,
  S extends string[] = string[],
  Ctx = unknown,
> = {
  readonly kind: "provider:context";
  readonly name: N;
  readonly secrets: S;
  readonly setup: (ctx: { secrets: { [K in S[number]]: string } }) => Ctx;
};

/**
 * Define a provider context with typed secrets and a setup function.
 *
 * @example
 * ```ts
 * const context = defineProviderContext({
 *   name: "hcloud",
 *   secrets: ["apiToken"],
 *   setup: ({ secrets }) => ({
 *     client: createClient({ apiToken: secrets.apiToken }),
 *   }),
 * });
 * ```
 */
export function defineProviderContext<
  N extends string,
  S extends string[],
  Ctx,
>(options: {
  name: N;
  secrets: [...S];
  setup: (ctx: { secrets: { [K in S[number]]: string } }) => Ctx;
}): ProviderContext<N, S, Ctx> {
  return {
    kind: "provider:context",
    name: options.name,
    secrets: options.secrets,
    setup: options.setup,
  } as ProviderContext<N, S, Ctx>;
}
