import http from "node:http";

export interface CaddyRoute {
  /** Domain with optional path, e.g. "api.example.com/v1". */
  match: string;
  /** Upstream address, e.g. "api:3000". */
  upstream: string;
}

/** Parse a route string into host and optional path prefix. */
function parseRoute(route: string): { host: string; path?: string } {
  const slashIdx = route.indexOf("/");
  if (slashIdx === -1) return { host: route };
  return { host: route.slice(0, slashIdx), path: route.slice(slashIdx) };
}

/** Generate a Caddy JSON config for the given routes. */
export function generateCaddyConfig(
  routes: CaddyRoute[],
): Record<string, unknown> {
  const caddyRoutes = routes.map((r) => {
    const { host, path } = parseRoute(r.match);

    const hostMatcher: Record<string, unknown> = { host: [host] };
    if (path) hostMatcher["path"] = [`${path}*`];
    const matchers: Record<string, unknown>[] = [hostMatcher];

    return {
      match: matchers,
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: r.upstream }],
        },
      ],
    };
  });

  return {
    apps: {
      http: {
        servers: {
          srv0: {
            listen: [":80", ":443"],
            routes: caddyRoutes,
          },
        },
      },
    },
  };
}

/** Push a full config to the Caddy admin API. */
export function pushCaddyConfig(
  adminPort: number,
  config: Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(config);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: adminPort,
        path: "/load",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(payload)),
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Caddy admin API returned ${res.statusCode}`));
          } else {
            resolve();
          }
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}
