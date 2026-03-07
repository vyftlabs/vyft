import type { Provider } from "@vyft/core";
import { RESOURCE, type ResourceDefinition } from "@vyft/core";
import docker, {
  createDockerContext,
  postgresHandlers,
  redisHandlers,
  siteHandlers,
} from "@vyft/docker";
import local from "@vyft/local";

type ProviderFactory = (opts: {
  project: string;
  stage: string;
}) => Provider<unknown>;

const FALLBACK_RESOURCES: Record<string, ResourceDefinition> = {
  postgres: { [RESOURCE]: true, name: "postgres", handlers: postgresHandlers },
  redis: { [RESOURCE]: true, name: "redis", handlers: redisHandlers },
  site: { [RESOURCE]: true, name: "site", handlers: siteHandlers },
};

function withFallbackResources(
  provider: Provider<unknown>,
  project: string,
  stage: string,
): Provider<unknown> {
  const resources = provider.config.resources ?? {};
  const missing: Record<string, ResourceDefinition> = {};
  for (const [name, def] of Object.entries(FALLBACK_RESOURCES)) {
    if (!resources[name]) {
      missing[name] = def;
    }
  }

  if (Object.keys(missing).length === 0) return provider;

  const originalContext = provider.config.context;
  return {
    config: {
      ...provider.config,
      context: async () => {
        const platformCtx = await originalContext();
        const dockerCtx = createDockerContext({ project, stage });
        return Object.assign({}, platformCtx, dockerCtx);
      },
      resources: { ...resources, ...missing },
    },
  };
}

export const runtimes = new Map<string, ProviderFactory>([
  ["docker", ({ project, stage }) => docker({ project, stage })],
]);

export const platforms = new Map<string, ProviderFactory>([
  [
    "remote",
    ({ project, stage }) => withFallbackResources(local({}), project, stage),
  ],
]);
