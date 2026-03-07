import type { ServiceInput } from "@vyft/runtime";
import type { DockerClient } from "./index.ts";

interface DockerInspect {
  Id: string;
  Name: string;
  Config: {
    Image: string;
    Env: string[];
    Cmd?: string[];
    ExposedPorts?: Record<string, object>;
    Labels?: Record<string, string>;
  };
  HostConfig: {
    RestartPolicy?: { Name: string };
    Binds?: string[];
    NetworkMode?: string;
  };
  State: {
    Status: string;
    Running: boolean;
  };
}

export async function inspectContainer(
  client: DockerClient,
  name: string,
): Promise<DockerInspect | undefined> {
  const res = await client.get<DockerInspect>(`/containers/${name}/json`);
  if (res.status !== 200) return undefined;
  return res.body;
}

export function normalizeDockerContainer(
  inspect: DockerInspect,
): Partial<ServiceInput> {
  const env: Record<string, string> = {};
  for (const e of inspect.Config.Env) {
    const idx = e.indexOf("=");
    if (idx > 0) {
      env[e.slice(0, idx)] = e.slice(idx + 1);
    }
  }

  const ports = Object.keys(inspect.Config.ExposedPorts ?? {});
  const portStr = ports[0];
  const port = portStr
    ? Number.parseInt(portStr.split("/")[0] ?? "3000", 10)
    : 3000;

  const mounts = inspect.HostConfig.Binds?.map((b) => {
    const idx = b.indexOf(":");
    return { source: b.slice(0, idx), target: b.slice(idx + 1) };
  });

  return {
    image: inspect.Config.Image,
    port,
    env,
    command: inspect.Config.Cmd ?? undefined,
    mounts: mounts && mounts.length > 0 ? mounts : undefined,
    restart:
      (inspect.HostConfig.RestartPolicy?.Name as ServiceInput["restart"]) ??
      "always",
  };
}
