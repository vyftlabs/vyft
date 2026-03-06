import type { Provider, ProviderConfig } from "@vyft/core";
import { defineRuntime } from "@vyft/runtime";
import { createClient } from "./client.ts";
import type { DockerContext } from "./context.ts";
import { cronjobHandlers } from "./cronjob.ts";
import { serviceHandlers } from "./service.ts";
import { volumeHandlers } from "./volume.ts";

export interface DockerProviderOptions {
  project: string;
  stage: string;
  socketPath?: string;
}

export function createDockerProvider(
  opts: DockerProviderOptions,
): Provider<DockerContext> {
  const config: ProviderConfig<DockerContext> = defineRuntime<DockerContext>({
    context() {
      const client = createClient(opts.socketPath);
      return {
        client,
        project: opts.project,
        stage: opts.stage,
        networkName: `vyft-${opts.project}-${opts.stage}`,
      };
    },
    handlers: {
      service: serviceHandlers,
      volume: volumeHandlers,
      cronjob: cronjobHandlers,
    },
  });

  return { config };
}
