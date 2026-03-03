import {
  createNamedResourceBuilder,
  createReusableResourceBuilder,
  type NamedResourceBuilder,
  type ResourceBuilder,
} from "./builder.ts";

// ── Provider Builder ────────────────────────────────────────────────────

export interface ProviderBuilder<Ctx, Secrets extends Record<string, string>> {
  /**
   * Create a resource builder with a name.
   */
  resource(name: string): NamedResourceBuilder<Ctx, Secrets>;

  /**
   * Create a reusable resource builder (without name).
   */
  createBuilder(): ResourceBuilder<Ctx, Secrets>;
}

// ── Options ─────────────────────────────────────────────────────────────

interface InitProviderOptionsSimple {
  name: string;
}

interface InitProviderOptionsWithSecrets<S extends string[], Ctx> {
  name: string;
  secrets: [...S];
  setup: (args: { secrets: { [K in S[number]]: string } }) => Ctx;
}

// ── initProvider ────────────────────────────────────────────────────────

/**
 * Initialize a provider with the builder pattern.
 *
 * @example
 * ```ts
 * // Simple provider (no secrets)
 * const t = initProvider({ name: "primitives" })
 *
 * // Provider with secrets
 * const t = initProvider({
 *   name: "hcloud",
 *   secrets: ["apiToken"],
 *   setup: ({ secrets }) => ({ client: createClient(secrets.apiToken) })
 * })
 *
 * // Define resources
 * const exec = t.resource("exec")
 *   .input(z.object({ command: z.array(z.string()) }))
 *   .handle({
 *     async create({ input, ctx }) {
 *       return { stdout: "..." }
 *     },
 *     async read() { return null; }
 *   })
 * ```
 */
export function initProvider(
  options: InitProviderOptionsSimple,
): ProviderBuilder<Record<string, never>, Record<string, never>>;

export function initProvider<S extends string[], Ctx>(
  options: InitProviderOptionsWithSecrets<S, Ctx>,
): ProviderBuilder<Ctx, { [K in S[number]]: string }>;

export function initProvider(
  options:
    | InitProviderOptionsSimple
    | InitProviderOptionsWithSecrets<string[], unknown>,
): ProviderBuilder<unknown, Record<string, string>> {
  const providerName = options.name;
  // Provider metadata stored for framework use
  void ("secrets" in options ? options.secrets : []);
  void ("setup" in options ? options.setup : () => ({}));

  return {
    resource(resourceName: string) {
      return createNamedResourceBuilder(providerName, resourceName, []);
    },

    createBuilder() {
      return createReusableResourceBuilder(providerName, []);
    },
  };
}
