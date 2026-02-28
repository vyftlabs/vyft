import type {
  CronJob,
  CronJobConfig,
  Secret,
  Service,
  ServiceConfig,
  Volume,
} from "../../../src/resource.ts";

export function vol(id: string): Volume {
  return { kind: "volume", id, config: {} };
}

export function sec(id: string): Secret {
  return { kind: "secret", id, config: {} };
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
  };
}

export function cron(
  id: string,
  config: CronJobConfig = { schedule: "* * * * *", image: "test" },
): CronJob {
  return { kind: "cronjob", id, config };
}
