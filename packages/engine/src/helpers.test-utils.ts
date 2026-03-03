import type {
  CronJob,
  CronJobConfig,
  Job,
  JobConfig,
  Secret,
  Service,
  ServiceConfig,
  Volume,
} from "@vyft/core";
import { INTERNAL, MOUNTABLE } from "@vyft/core";

export function vol(id: string): Volume {
  return { kind: "volume", id, config: {}, [MOUNTABLE]: true };
}

export function sec(id: string): Secret {
  return { kind: "config", id, config: {} };
}

export function svc(
  id: string,
  config: ServiceConfig = { image: "test" },
): Service {
  const port = config.port ?? 3000;
  return {
    kind: "service",
    id,
    config,
    host: id,
    port,
    url: `http://${id}:${port}`,
    [INTERNAL]: { ready: async () => {} }, // no-op for tests
  };
}

export function job(id: string, config: JobConfig = { image: "test" }): Job {
  return {
    kind: "job",
    id,
    config,
    [INTERNAL]: { ready: async () => {} }, // no-op for tests
  };
}

export function cron(
  id: string,
  config: CronJobConfig = { schedule: "* * * * *", image: "test" },
): CronJob {
  return { kind: "cronjob", id, config };
}
