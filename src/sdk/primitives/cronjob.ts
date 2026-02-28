import type { CronJob, CronJobConfig } from "../../resource.ts";
import { validateCron, validateDuration, validateId } from "../../resource.ts";

/**
 * Create a scheduled job that runs on a cron schedule.
 *
 * @example
 * ```ts
 * cronjob("cleanup", { image: "alpine", schedule: "0 3 * * *", command: "rm -rf /tmp/*" })
 * ```
 */
export function cronjob(id: string, config: CronJobConfig): CronJob {
  validateId(id);
  validateCron(config.schedule);
  if (config.health) {
    if (config.health.interval !== undefined)
      validateDuration("health.interval", config.health.interval);
    if (config.health.timeout !== undefined)
      validateDuration("health.timeout", config.health.timeout);
    if (config.health.startPeriod !== undefined)
      validateDuration("health.startPeriod", config.health.startPeriod);
  }
  return { kind: "cronjob", id, config };
}
