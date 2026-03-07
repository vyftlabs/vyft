import { createProvider } from "@vyft/provider";
import { bucketResource } from "./bucket.ts";
import { postgresResource } from "./postgres.ts";
import { queueResource } from "./queue.ts";
import { redisResource } from "./redis.ts";
import { siteResource } from "./site.ts";

const platform = createProvider({
  name: "platform",
  context: () => ({}),
  resources: {
    bucket: bucketResource,
    postgres: postgresResource,
    queue: queueResource,
    redis: redisResource,
    site: siteResource,
  },
});

export const { bucket, postgres, queue, redis, site } = platform;
