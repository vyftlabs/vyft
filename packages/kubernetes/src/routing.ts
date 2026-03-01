import type { K8sClient, K8sManifest } from "./client.ts";

export interface IngressRoute {
  id: string;
  route: string;
  port: number;
}

/** Parse a route string into host and optional path. */
function parseRoute(route: string): { host: string; path?: string } {
  const slashIdx = route.indexOf("/");
  if (slashIdx === -1) return { host: route };
  return { host: route.slice(0, slashIdx), path: route.slice(slashIdx) };
}

/** Build an Ingress manifest for a service. */
export function buildIngressManifest(
  name: string,
  namespace: string,
  id: string,
  route: string,
  port: number,
): K8sManifest {
  const { host, path } = parseRoute(route);
  const pathValue = path ?? "/";

  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: {
      name,
      namespace,
      labels: {
        "app.kubernetes.io/name": id,
        "app.kubernetes.io/managed-by": "vyft",
      },
    },
    spec: {
      rules: [
        {
          host,
          http: {
            paths: [
              {
                path: pathValue,
                pathType: path ? "Prefix" : "Prefix",
                backend: {
                  service: {
                    name: id,
                    port: { number: port },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };
}

/** Apply (create or update) an Ingress for a service. */
export async function applyIngress(
  client: K8sClient,
  namespace: string,
  id: string,
  route: string,
  port: number,
): Promise<void> {
  const name = id;
  const manifest = buildIngressManifest(name, namespace, id, route, port);

  try {
    await client.replaceIngress({ namespace, name, body: manifest });
  } catch (err: unknown) {
    if (isNotFound(err)) {
      await client.createIngress({ namespace, body: manifest });
    } else {
      throw err;
    }
  }
}

/** Delete an Ingress. */
export async function deleteIngress(
  client: K8sClient,
  namespace: string,
  id: string,
): Promise<void> {
  try {
    await client.deleteIngress({ namespace, name: id });
  } catch (err: unknown) {
    if (!isNotFound(err)) throw err;
  }
}

function isNotFound(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (e["statusCode"] === 404 || e["code"] === 404) return true;
    if (typeof e["response"] === "object" && e["response"] !== null) {
      const resp = e["response"] as Record<string, unknown>;
      if (resp["statusCode"] === 404) return true;
    }
  }
  return false;
}
