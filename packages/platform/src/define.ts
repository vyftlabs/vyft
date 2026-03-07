import type { Handlers, Provider } from "@vyft/core";
import { RESOURCE } from "@vyft/core";
import type {
  BucketInput,
  NetworkInput,
  PostgresInput,
  QueueInput,
  SecretInput,
  ServerInput,
  VolumeInput,
} from "./schemas.ts";

export const PLATFORM_PROVIDER_NAME = "platform";

export interface PlatformConfig<TOpts, TCtx> {
  name: string;
  context: (opts: TOpts) => TCtx | Promise<TCtx>;
  handlers: {
    server: Handlers<ServerInput, TCtx>;
    volume: Handlers<VolumeInput, TCtx>;
    network: Handlers<NetworkInput, TCtx>;
    bucket?: Handlers<BucketInput, TCtx>;
    postgres?: Handlers<PostgresInput, TCtx>;
    queue?: Handlers<QueueInput, TCtx>;
    secret?: Handlers<SecretInput, TCtx>;
  };
}

function entry<TInput, TCtx>(name: string, handlers: Handlers<TInput, TCtx>) {
  return { [RESOURCE]: true as const, name, handlers };
}

export function definePlatform<TOpts, TCtx>(
  config: PlatformConfig<TOpts, TCtx>,
): (opts: TOpts) => Provider<TCtx> {
  return (opts) => ({
    config: {
      context: () => config.context(opts),
      resources: {
        server: entry("server", config.handlers.server),
        volume: entry("volume", config.handlers.volume),
        network: entry("network", config.handlers.network),
        ...(config.handlers.bucket && {
          bucket: entry("bucket", config.handlers.bucket),
        }),
        ...(config.handlers.postgres && {
          postgres: entry("postgres", config.handlers.postgres),
        }),
        ...(config.handlers.queue && {
          queue: entry("queue", config.handlers.queue),
        }),
        ...(config.handlers.secret && {
          secret: entry("secret", config.handlers.secret),
        }),
      },
    },
  });
}
