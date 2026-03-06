import type { DockerClient } from "./client.ts";

interface CaddyRoute {
  match: Array<{ host?: string[]; path?: string[] }>;
  handle: Array<{
    handler: string;
    upstreams?: Array<{ dial: string }>;
    routes?: CaddyRoute[];
  }>;
}

interface CaddyConfig {
  apps: {
    http: {
      servers: Record<string, { listen: string[]; routes: CaddyRoute[] }>;
    };
  };
}

export function buildCaddyConfig(
  services: Array<{
    host: string;
    port: number;
    route?: string;
    domain?: string;
  }>,
): CaddyConfig {
  const routes: CaddyRoute[] = services.map((svc) => ({
    match: [
      {
        ...(svc.domain ? { host: [svc.domain] } : {}),
        ...(svc.route ? { path: [`${svc.route}*`] } : {}),
      },
    ],
    handle: [
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: `${svc.host}:${svc.port}` }],
      },
    ],
  }));

  return {
    apps: {
      http: {
        servers: {
          srv0: {
            listen: [":80"],
            routes,
          },
        },
      },
    },
  };
}

export async function pushCaddyConfig(
  client: DockerClient,
  caddyContainerName: string,
  config: CaddyConfig,
): Promise<void> {
  // Caddy admin API listens on :2019 inside the container
  // We exec into the container to push config via localhost
  const execRes = await client.post<{ Id: string }>(
    `/containers/${caddyContainerName}/exec`,
    {
      Cmd: [
        "wget",
        "-q",
        "-O-",
        "--post-data",
        JSON.stringify(config),
        "--header",
        "Content-Type: application/json",
        "http://localhost:2019/load",
      ],
      AttachStdout: true,
      AttachStderr: true,
    },
  );

  if (execRes.status === 201) {
    await client.post(`/exec/${execRes.body.Id}/start`, {
      Detach: false,
      Tty: false,
    });
  }
}
