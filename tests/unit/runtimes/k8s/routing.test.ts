import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { buildIngressManifest } from "../../../../src/runtimes/k8s/routing.ts";

describe("buildIngressManifest", () => {
  it("builds ingress for domain-only route", () => {
    const m = buildIngressManifest(
      "api",
      "ns",
      "api",
      "api.example.com",
      3000,
    ) as Record<string, unknown>;

    strictEqual(m.apiVersion, "networking.k8s.io/v1");
    strictEqual(m.kind, "Ingress");

    const metadata = m.metadata as Record<string, unknown>;
    strictEqual(metadata.name, "api");
    strictEqual(metadata.namespace, "ns");

    const spec = m.spec as Record<string, unknown>;
    const rules = spec.rules as Record<string, unknown>[];
    strictEqual(rules.length, 1);
    strictEqual(rules[0]?.host, "api.example.com");

    const http = rules[0]?.http as Record<string, unknown>;
    const paths = http.paths as Record<string, unknown>[];
    strictEqual(paths.length, 1);
    strictEqual(paths[0]?.path, "/");
    strictEqual(paths[0]?.pathType, "Prefix");

    const backend = paths[0]?.backend as Record<string, unknown>;
    const svc = backend.service as Record<string, unknown>;
    strictEqual(svc.name, "api");
    deepStrictEqual(svc.port, { number: 3000 });
  });

  it("builds ingress for route with path", () => {
    const m = buildIngressManifest(
      "api",
      "ns",
      "api",
      "api.example.com/v1",
      8080,
    ) as Record<string, unknown>;

    const spec = m.spec as Record<string, unknown>;
    const rules = spec.rules as Record<string, unknown>[];
    const http = rules[0]?.http as Record<string, unknown>;
    const paths = http.paths as Record<string, unknown>[];

    strictEqual(paths[0]?.path, "/v1");

    const backend = paths[0]?.backend as Record<string, unknown>;
    const svc = backend.service as Record<string, unknown>;
    deepStrictEqual(svc.port, { number: 8080 });
  });

  it("sets managed-by label", () => {
    const m = buildIngressManifest("api", "ns", "api", "x.com", 3000) as Record<
      string,
      unknown
    >;
    const metadata = m.metadata as Record<string, unknown>;
    const labels = metadata.labels as Record<string, string>;
    strictEqual(labels["app.kubernetes.io/managed-by"], "vyft");
  });
});
