import { bindings } from "@vyft/client";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(bindings.redis.url, {
  maxRetriesPerRequest: null,
});

// hello

export const jobQueue = new Queue("jobs", { connection });
