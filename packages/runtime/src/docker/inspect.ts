import { nanosToDigits } from "@vyft/core";

interface DockerContainerJson {
  Config?: {
    Image?: string;
    Env?: string[];
    Cmd?: string[] | null;
    Healthcheck?: {
      Test?: string[];
      Interval?: number;
      Timeout?: number;
      Retries?: number;
      StartPeriod?: number;
    };
  };
  HostConfig?: {
    Binds?: string[];
    RestartPolicy?: { Name: string };
  };
}

/** Normalize a Docker container inspect response into vyft ServiceConfig-like shape. */
export function normalizeDockerContainer(
  info: unknown,
): Record<string, unknown> {
  const c = info as DockerContainerJson;
  const result: Record<string, unknown> = {};

  if (c.Config?.Image) result["image"] = c.Config.Image;

  if (c.Config?.Env) {
    const env: Record<string, string> = {};
    for (const e of c.Config.Env) {
      const idx = e.indexOf("=");
      if (idx > 0) env[e.slice(0, idx)] = e.slice(idx + 1);
    }
    if (Object.keys(env).length > 0) result["env"] = env;
  }

  if (c.Config?.Cmd) result["command"] = c.Config.Cmd;

  if (c.Config?.Healthcheck?.Test) {
    const hc: Record<string, unknown> = {};
    const test = c.Config.Healthcheck.Test;
    // CMD-SHELL format: ["CMD-SHELL", "cmd"]
    if (test[0] === "CMD-SHELL" && test[1]) hc["command"] = test[1];
    if (c.Config.Healthcheck.Interval)
      hc["interval"] = nanosToDigits(c.Config.Healthcheck.Interval);
    if (c.Config.Healthcheck.Timeout)
      hc["timeout"] = nanosToDigits(c.Config.Healthcheck.Timeout);
    if (c.Config.Healthcheck.Retries !== undefined)
      hc["retries"] = c.Config.Healthcheck.Retries;
    if (c.Config.Healthcheck.StartPeriod)
      hc["startPeriod"] = nanosToDigits(c.Config.Healthcheck.StartPeriod);
    if (Object.keys(hc).length > 0) result["health"] = hc;
  }

  if (c.HostConfig?.Binds) {
    const mounts: { source: string; path: string }[] = [];
    for (const bind of c.HostConfig.Binds) {
      const [source, target] = bind.split(":");
      if (source && target) mounts.push({ source, path: target });
    }
    if (mounts.length > 0) result["mounts"] = mounts;
  }

  if (c.HostConfig?.RestartPolicy?.Name) {
    const name = c.HostConfig.RestartPolicy.Name;
    const map: Record<string, string> = {
      "": "none",
      no: "none",
      always: "always",
      "on-failure": "on-failure",
      "unless-stopped": "always",
    };
    result["restart"] = map[name] ?? name;
  }

  return result;
}
