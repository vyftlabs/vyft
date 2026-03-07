import type { Handlers, Provider } from "@vyft/core";
import { RESOURCE } from "@vyft/core";
import type {
  CronJobInput,
  JobInput,
  ServiceInput,
  VolumeInput,
} from "./schemas.ts";

export interface RuntimeConfig<TOpts, TCtx> {
  name: string;
  context: (opts: TOpts) => TCtx | Promise<TCtx>;
  handlers: {
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
