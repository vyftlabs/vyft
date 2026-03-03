import type { ArtifactRef, ArtifactStore } from "./artifact.ts";
import type {
  FrameworkContext,
  HandlerResult,
  ResourceDefinition,
  ResourceId,
} from "./builder.ts";

/**
 * Creates an in-memory artifact store for testing.
 */
export function createMockArtifactStore(): ArtifactStore {
  const artifacts = new Map<string, Buffer>();
  const registered = new Map<string, ArtifactRef>();

  return {
    async write(key: string, content: string | Buffer): Promise<ArtifactRef> {
      const buf = typeof content === "string" ? Buffer.from(content) : content;
      const hash = `mock-${key}-${Date.now()}`;
      artifacts.set(hash, buf);
      const ref: ArtifactRef = {
        kind: "artifact",
        key,
        hash,
        size: buf.length,
      };
      registered.set(key, ref);
      return ref;
    },
    async read(ref: ArtifactRef): Promise<Buffer> {
      const buf = artifacts.get(ref.hash);
      if (!buf) throw new Error(`Artifact not found: ${ref.hash}`);
      return buf;
    },
    async exists(ref: ArtifactRef): Promise<boolean> {
      return artifacts.has(ref.hash);
    },
    async delete(ref: ArtifactRef): Promise<void> {
      artifacts.delete(ref.hash);
      for (const [key, r] of registered) {
        if (r.hash === ref.hash) registered.delete(key);
      }
    },
    async deleteAll(): Promise<void> {
      artifacts.clear();
      registered.clear();
    },
    getRegistered(): Map<string, ArtifactRef> {
      return new Map(registered);
    },
  };
}

/**
 * Options for creating a test context.
 */
export interface TestContextOptions<ProviderCtx = Record<string, never>> {
  /** Provider-specific context (e.g., API clients) */
  ctx?: ProviderCtx;
  /** Override the artifact store */
  artifacts?: ArtifactStore;
  /** Override the resource ID */
  resourceId?: string;
  /** Override the resource name */
  resourceName?: string;
}

/**
 * Creates a test context for calling resource handlers directly.
 *
 * @example
 * ```ts
 * // Simple provider (no custom context)
 * const ctx = createTestContext();
 * const result = await randomString.handler.create({ id, input, ctx });
 *
 * // Provider with custom context
 * const ctx = createTestContext({ ctx: { client: mockClient } });
 * const result = await network.handler.create({ id, input, ctx });
 * ```
 */
export function createTestContext<ProviderCtx = Record<string, never>>(
  options: TestContextOptions<ProviderCtx> = {},
): FrameworkContext & ProviderCtx {
  const frameworkCtx: FrameworkContext = {
    artifacts: options.artifacts ?? createMockArtifactStore(),
    meta: {
      resourceId: options.resourceId ?? "test-resource-id",
      resourceName: options.resourceName ?? "test-resource",
    },
  };

  return {
    ...frameworkCtx,
    ...(options.ctx ?? ({} as ProviderCtx)),
  } as FrameworkContext & ProviderCtx;
}

/**
 * Options for test resource operations.
 */
export interface TestResourceOptions<I, ProviderCtx> {
  /** The input for the handler */
  input: I;
  /** Provider-specific context (e.g., API clients) */
  ctx?: ProviderCtx;
  /** Override the internal resource ID */
  id?: string;
  /** Override the external resource ID (for read/update/delete) */
  externalId?: string;
}

/** Result from create/read/update operations */
export interface TestResourceResult<O> {
  output: O;
  externalId?: string;
}

function buildResourceId(id?: string, externalId?: string): ResourceId {
  const result: ResourceId = { internal: id ?? "test-id" };
  if (externalId !== undefined) {
    return { ...result, externalId };
  }
  return result;
}

function buildResult<O>(result: HandlerResult<O> | O): TestResourceResult<O> {
  if (result && typeof result === "object" && "output" in result) {
    const r = result as HandlerResult<O>;
    if (r.externalId !== undefined) {
      return { output: r.output, externalId: r.externalId };
    }
    return { output: r.output };
  }
  return { output: result as O };
}

/**
 * Test helper for calling resource handlers with minimal boilerplate.
 *
 * @example
 * ```ts
 * // Test create
 * const { output } = await testResource(randomString).create({
 *   input: { length: 32 },
 * });
 *
 * // Test with provider context
 * const { output } = await testResource(network).create({
 *   input: { name: "test", ipRange: "10.0.0.0/8", zone: "eu-central" },
 *   ctx: { client: mockClient },
 * });
 *
 * // Test read
 * const result = await testResource(network).read({
 *   ctx: { client: mockClient },
 *   externalId: "12345",
 * });
 *
 * // Test delete
 * await testResource(network).delete({
 *   ctx: { client: mockClient },
 *   externalId: "12345",
 * });
 * ```
 */
export function testResource<I, O, Ctx>(
  resource: ResourceDefinition<I, O, Ctx>,
) {
  return {
    /**
     * Call the create handler and return the output.
     */
    async create(
      options: TestResourceOptions<I, Ctx>,
    ): Promise<TestResourceResult<O>> {
      const ctx = createTestContext(
        options.ctx !== undefined ? { ctx: options.ctx } : {},
      ) as FrameworkContext & Ctx;
      const id = buildResourceId(options.id, options.externalId);
      const result = await resource.handler.create({
        id,
        input: options.input,
        ctx,
      });
      return buildResult(result);
    },

    /**
     * Call the read handler and return the output (or null if not found).
     */
    async read(
      options: Omit<TestResourceOptions<I, Ctx>, "input"> & { input?: never },
    ): Promise<TestResourceResult<O> | null> {
      if (!resource.handler.read) {
        throw new Error(`Resource "${resource.name}" does not implement read`);
      }

      const ctx = createTestContext(
        options.ctx !== undefined ? { ctx: options.ctx } : {},
      ) as FrameworkContext & Ctx;
      const id = buildResourceId(options.id, options.externalId);
      const result = await resource.handler.read({ id, ctx });

      if (result === null) return null;
      return buildResult(result);
    },

    /**
     * Call the update handler and return the output.
     */
    async update(
      options: TestResourceOptions<I, Ctx>,
    ): Promise<TestResourceResult<O>> {
      if (!resource.handler.update) {
        throw new Error(
          `Resource "${resource.name}" does not implement update`,
        );
      }

      const ctx = createTestContext(
        options.ctx !== undefined ? { ctx: options.ctx } : {},
      ) as FrameworkContext & Ctx;
      const id = buildResourceId(options.id, options.externalId);
      const result = await resource.handler.update({
        id,
        input: options.input,
        ctx,
      });
      return buildResult(result);
    },

    /**
     * Call the delete handler.
     */
    async delete(
      options: Omit<TestResourceOptions<I, Ctx>, "input"> & { input?: never },
    ): Promise<void> {
      if (!resource.handler.delete) {
        throw new Error(
          `Resource "${resource.name}" does not implement delete`,
        );
      }

      const ctx = createTestContext(
        options.ctx !== undefined ? { ctx: options.ctx } : {},
      ) as FrameworkContext & Ctx;
      const id = buildResourceId(options.id, options.externalId);
      await resource.handler.delete({ id, ctx });
    },
  };
}
