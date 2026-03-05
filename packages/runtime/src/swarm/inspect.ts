import { nanosToDigits } from "../duration.ts";

interface SwarmServiceJson {
  Spec?: {
    TaskTemplate?: {
      ContainerSpec?: {
        Image?: string;
        Env?: string[];
        Command?: string[] | null;
        Healthcheck?: {
          Test?: string[];
          Interval?: number;
          Timeout?: number;
          Retries?: number;
          StartPeriod?: number;
        };
        Mounts?: { Source?: string; Target?: string }[];
      };
      RestartPolicy?: { Condition?: string };
    };
    Mode?: { Replicated?: { Replicas?: number } };
  };
}

/** Normalize a Swarm service inspect response into vyft ServiceConfig-like shape. */
export function normalizeSwarmService(info: unknown): Record<string, unknown> {
  const s = info as SwarmServiceJson;
  const cs = s.Spec?.TaskTemplate?.ContainerSpec;
  const result: Record<string, unknown> = {};

  if (cs?.Image) {
    result["image"] = cs.Image.split("@")[0];
  }

  if (cs?.Env) {
    const env: Record<string, string> = {};
    for (const e of cs.Env) {
      const idx = e.indexOf("=");
      if (idx > 0) env[e.slice(0, idx)] = e.slice(idx + 1);
    }
    if (Object.keys(env).length > 0) result["env"] = env;
  }

  if (cs?.Command) result["command"] = cs.Command;

  if (cs?.Healthcheck?.Test) {
    const hc: Record<string, unknown> = {};
    const test = cs.Healthcheck.Test;
    if (test[0] === "CMD-SHELL" && test[1]) hc["command"] = test[1];
    if (cs.Healthcheck.Interval)
      hc["interval"] = nanosToDigits(cs.Healthcheck.Interval);
    if (cs.Healthcheck.Timeout)
      hc["timeout"] = nanosToDigits(cs.Healthcheck.Timeout);
    if (cs.Healthcheck.Retries !== undefined)
      hc["retries"] = cs.Healthcheck.Retries;
    if (cs.Healthcheck.StartPeriod)
      hc["startPeriod"] = nanosToDigits(cs.Healthcheck.StartPeriod);
    if (Object.keys(hc).length > 0) result["health"] = hc;
  }

  if (cs?.Mounts) {
    const mounts: { source: string; path: string }[] = [];
    for (const m of cs.Mounts) {
      if (m.Source && m.Target)
        mounts.push({ source: m.Source, path: m.Target });
    }
    if (mounts.length > 0) result["mounts"] = mounts;
  }

  const cond = s.Spec?.TaskTemplate?.RestartPolicy?.Condition;
  if (cond) {
    const map: Record<string, string> = {
      none: "none",
      "on-failure": "on-failure",
      any: "always",
    };
    result["restart"] = map[cond] ?? cond;
  }

  const replicas = s.Spec?.Mode?.Replicated?.Replicas;
  if (replicas !== undefined && replicas !== 1) result["replicas"] = replicas;

  return result;
}
