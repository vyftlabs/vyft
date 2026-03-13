import type { Handlers, Provider, ResourceDefinition } from "@vyft/core";
import { DEPENDABLE, RESOURCE, registry, urn } from "@vyft/core";
import { RUNTIME_PROVIDER_NAME } from "./constructors.ts";
import type {
  BuildInput,
  CronJobInput,
  JobInput,
  ServiceInput,
  VolumeInput,
} from "./schemas.ts";

// ---------------------------------------------------------------------------
// Ambient binding state — set by Provider.config.init() so that
// .resource() callables know which provider they belong to.
// ---------------------------------------------------------------------------

let ambientProvider: Provider<unknown> | undefined;
let ambientResources: Record<string, ResourceDefinition> | undefined;

export function setAmbientProvider(
  provider: Provider<unknown>,
  resources: Record<string, ResourceDefinition>,
): void {
  ambientProvider = provider;
  ambientResources = resources;
}

export function clearAmbientProvider(): void {
  ambientProvider = undefined;
  ambientResources = undefined;
}

// ---------------------------------------------------------------------------
// createRuntime
// ---------------------------------------------------------------------------

export interface RuntimeResourceCallable<TInput> {
  (id: string, input?: TInput): void;
}

export function createRuntime<TOpts, TCtx>(
  name: string,
  context: (opts: TOpts) => TCtx | Promise<TCtx>,
) {
  const customResources: Record<string, ResourceDefinition> = {};

  return {
    /** Runtime name — useful for diagnostics. */
    name,

    /**
     * Identity function — provides TypeScript inference for service handlers.
     */
    service(handlers: Handlers<ServiceInput, TCtx>): Handlers<ServiceInput, TCtx> {
      return handlers;
    },

    /**
     * Identity function — provides TypeScript inference for volume handlers.
     */
    volume(handlers: Handlers<VolumeInput, TCtx>): Handlers<VolumeInput, TCtx> {
      return handlers;
    },

    /**
     * Identity function — provides TypeScript inference for job handlers.
     */
    job(handlers: Handlers<JobInput, TCtx>): Handlers<JobInput, TCtx> {
      return handlers;
    },

    /**
     * Identity function — provides TypeScript inference for cronjob handlers.
     */
    cronjob(handlers: Handlers<CronJobInput, TCtx>): Handlers<CronJobInput, TCtx> {
      return handlers;
    },

    /**
     * Identity function — provides TypeScript inference for build handlers.
     */
    build(handlers: Handlers<BuildInput, TCtx>): Handlers<BuildInput, TCtx> {
      return handlers;
    },

    /**
     * Define a custom resource for use in init.
     * Returns a callable that self-registers via ambient binding when invoked.
     */
    resource<TInput>(
      resourceName: string,
      handlers: Handlers<TInput, TCtx>,
    ): RuntimeResourceCallable<TInput> {
      const definition: ResourceDefinition = {
        [RESOURCE]: true,
        name: resourceName,
        // biome-ignore lint/suspicious/noExplicitAny: handler types are erased at registration
        handlers: handlers as Handlers<any, any>,
      };
      customResources[resourceName] = definition;

      return (id: string, input?: TInput) => {
        if (!ambientProvider || !ambientResources) {
          throw new Error(
            `${resourceName}() can only be called inside a runtime init function.`,
          );
        }
        // Ensure the resource definition is on the provider
        if (!ambientResources[resourceName]) {
          ambientResources[resourceName] = definition;
        }
        // Register the entry in the global registry
        const resourceUrn = urn.build("resource", RUNTIME_PROVIDER_NAME, resourceName, id);
        registry.register({
          [DEPENDABLE]: true,
          urn: resourceUrn,
          value: input ?? {},
          provider: ambientProvider,
        });
      };
    },

    /**
     * Produce the final Provider from handler config.
     */
    define(config: {
      service: Handlers<ServiceInput, TCtx>;
      volume: Handlers<VolumeInput, TCtx>;
      job: Handlers<JobInput, TCtx>;
      cronjob: Handlers<CronJobInput, TCtx>;
      build: Handlers<BuildInput, TCtx>;
      init?: (opts: TOpts) => void;
    }): (opts: TOpts) => Provider<TCtx> {
      return (opts) => {
        // biome-ignore lint/suspicious/noExplicitAny: resources have varying input types
        const resources: Record<string, ResourceDefinition<any, any, TCtx>> = {
          build: { [RESOURCE]: true, name: "build", handlers: config.build },
          service: { [RESOURCE]: true, name: "service", handlers: config.service },
          job: { [RESOURCE]: true, name: "job", handlers: config.job },
          volume: { [RESOURCE]: true, name: "volume", handlers: config.volume },
          cronjob: { [RESOURCE]: true, name: "cronjob", handlers: config.cronjob },
        };

        // Pre-register custom resource definitions (from .resource() calls)
        for (const [rName, def] of Object.entries(customResources)) {
          resources[rName] = def;
        }

        const provider: Provider<TCtx> = {
          config: {
            context: () => context(opts),
            resources,
          },
        };

        if (config.init) {
          const userInit = config.init;
          provider.config.init = () => {
            setAmbientProvider(
              provider,
              // biome-ignore lint/suspicious/noExplicitAny: erased at registration boundary
              resources as Record<string, ResourceDefinition<any, any, any>>,
            );
            try {
              userInit(opts);
            } finally {
              clearAmbientProvider();
            }
          };
        }

        return provider;
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Legacy API — kept for backward compatibility
// ---------------------------------------------------------------------------

export interface RuntimeConfig<TOpts, TCtx> {
  name: string;
  context: (opts: TOpts) => TCtx | Promise<TCtx>;
  handlers: {
    build: Handlers<BuildInput, TCtx>;
    service: Handlers<ServiceInput, TCtx>;
    job: Handlers<JobInput, TCtx>;
    volume: Handlers<VolumeInput, TCtx>;
    cronjob: Handlers<CronJobInput, TCtx>;
  };
}

export function defineRuntime<TOpts, TCtx>(
  config: RuntimeConfig<TOpts, TCtx>,
): (opts: TOpts) => Provider<TCtx> {
  return (opts) => ({
    config: {
      context: () => config.context(opts),
      resources: {
        build: {
          [RESOURCE]: true,
          name: "build",
          handlers: config.handlers.build,
        },
        service: {
          [RESOURCE]: true,
          name: "service",
          handlers: config.handlers.service,
        },
        job: {
          [RESOURCE]: true,
          name: "job",
          handlers: config.handlers.job,
        },
        volume: {
          [RESOURCE]: true,
          name: "volume",
          handlers: config.handlers.volume,
        },
        cronjob: {
          [RESOURCE]: true,
          name: "cronjob",
          handlers: config.handlers.cronjob,
        },
      },
    },
  });
}
