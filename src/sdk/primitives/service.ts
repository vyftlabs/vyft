import { ValidationError } from "../../errors.ts";
import type { Service, ServiceConfig } from "../../resource.ts";
import { validateDuration, validateId, validateRoute } from "../../resource.ts";

const DEFAULT_PORT = 3000;

/**
 * Create a long-running service.
 *
 * @example
 * ```ts
 * service("api", { build: "./apps/api", route: "api.example.com" })
 * service("db", { image: "postgres:17", port: 5432 })
 * ```
 */
export function service(id: string, config: ServiceConfig): Service {
  validateId(id);
  if (config.route !== undefined) validateRoute(config.route);
  const port = config.port ?? DEFAULT_PORT;
  if (port < 1 || port > 65535 || !Number.isInteger(port)) {
    throw new ValidationError(
      `Service "${id}" port must be an integer between 1 and 65535`,
    );
  }
  if (config.health) {
    if (config.health.interval !== undefined)
      validateDuration("health.interval", config.health.interval);
    if (config.health.timeout !== undefined)
      validateDuration("health.timeout", config.health.timeout);
    if (config.health.startPeriod !== undefined)
      validateDuration("health.startPeriod", config.health.startPeriod);
  }
  return {
    kind: "service",
    id,
    config,
    host: id,
    port,
    url: `http://${id}:${port}`,
  };
}
