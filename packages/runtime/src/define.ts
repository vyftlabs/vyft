import type { Handlers, ProviderConfig } from "@vyft/core";
import type { CronJobInput, ServiceInput, VolumeInput } from "./schemas.ts";
import { cronJobInput, serviceInput, volumeInput } from "./schemas.ts";

export interface RuntimeConfig<TCtx> {
  context: () => Promise<TCtx> | TCtx;
  handlers: {
    service: Handlers<ServiceInput, TCtx>;
    volume: Handlers<VolumeInput, TCtx>;
    cronjob: Handlers<CronJobInput, TCtx>;
  };
}

export function defineRuntime<TCtx>(
  config: RuntimeConfig<TCtx>,
): ProviderConfig<TCtx> {
  return {
    context: config.context,
    resources: {
      service: { schema: serviceInput, handlers: config.handlers.service },
      volume: { schema: volumeInput, handlers: config.handlers.volume },
      cronjob: { schema: cronJobInput, handlers: config.handlers.cronjob },
    },
  };
}
