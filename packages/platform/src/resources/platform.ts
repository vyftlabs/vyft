import { createProvider } from "@vyft/provider";
import { postgresResource } from "./postgres.ts";
import { redisResource } from "./redis.ts";
import { siteResource } from "./site.ts";

const platform = createProvider({
  name: "platform",
  context: () => ({}),
  resources: {
    postgres: postgresResource,
    redis: redisResource,
    site: siteResource,
  },
});

export const { postgres, redis, site } = platform;
