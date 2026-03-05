import type {
  CronJob,
  CronJobConfig,
  Job,
  JobConfig,
  Service,
  ServiceConfig,
  URN,
  Variable,
  Volume,
} from "@vyft/primitives";
import { buildURN, INTERNAL, MOUNTABLE } from "@vyft/primitives";

export function vol(id: string, urn?: URN): Volume {
  return {
    kind: "volume",
    id,
    urn: urn ?? buildURN("platform", "default", "volume", id),
    config: {},
    [MOUNTABLE]: true,
  };
}

export function sec(id: string, urn?: URN): Variable {
  return {
    kind: "variable",
    id,
    urn: urn ?? buildURN("platform", "default", "variable", id),
    config: {},
  };
}

export function svc(
  id: string,
  config: ServiceConfig = { image: "test" },
  urn?: URN,
): Service {
  const port = config.port ?? 3000;
  return {
    kind: "service",
    id,
    urn: urn ?? buildURN("runtime", "default", "service", id),
    config,
    host: id,
    port,
    url: `http://${id}:${port}`,
    [INTERNAL]: { ready: async () => {} }, // no-op for tests
  };
}

export function job(
  id: string,
  config: JobConfig = { image: "test" },
  urn?: URN,
): Job {
  return {
    kind: "job",
    id,
    urn: urn ?? buildURN("runtime", "default", "job", id),
    config,
    [INTERNAL]: { ready: async () => {} }, // no-op for tests
  };
}

export function cron(
  id: string,
  config: CronJobConfig = { schedule: "* * * * *", image: "test" },
  urn?: URN,
): CronJob {
  return {
    kind: "cronjob",
    id,
    urn: urn ?? buildURN("runtime", "default", "cronjob", id),
    config,
  };
}
