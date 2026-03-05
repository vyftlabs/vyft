import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { type Mountable, MOUNTABLE } from "@vyft/primitives";
import { buildClusterIPManifest, buildDeploymentManifest } from "./service.ts";

const emptySecrets = new Map<string, string>();

describe("buildDeploymentManifest", () => {
  it("builds basic deployment", () => {
    const m = buildDeploymentManifest(
      "api",
      "ns",
      "api",
      { image: "node:22" },
      emptySecrets,
    );
    strictEqual(m.metadata.name, "api");
    strictEqual(m.metadata.namespace, "ns");
    strictEqual(m.spec.replicas, 1);
    strictEqual(m.spec.strategy.type, "RollingUpdate");
    const containers = m.spec.template.spec["containers"] as Record<
      string,
      unknown
    >[];
    strictEqual(containers.length, 1);
    strictEqual(containers[0]?.["name"], "api");
    strictEqual(containers[0]?.["image"], "node:22");
  });

  it("sets replicas from config", () => {
    const m = buildDeploymentManifest(
      "api",
      "ns",
      "api",
      { image: "test", replicas: 5 },
      emptySecrets,
    );
    strictEqual(m.spec.replicas, 5);
  });

  it("resolves env vars", () => {
    const secrets = new Map([["token", "abc"]]);
    const m = buildDeploymentManifest(
      "api",
      "ns",
      "api",
      {
        image: "test",
        env: { HOST: "0.0.0.0", TOKEN: { kind: "variable", id: "token" } },
      },
      secrets,
    );
    const containers = m.spec.template.spec["containers"] as Record<
      string,
      unknown
    >[];
    const envArr = containers[0]?.["env"] as { name: string; value: string }[];
    ok(envArr.some((e) => e.name === "HOST" && e.value === "0.0.0.0"));
    ok(envArr.some((e) => e.name === "TOKEN" && e.value === "abc"));
  });

  it("includes volume mounts", () => {
    const vol = {
      kind: "volume" as const,
      id: "data",
      config: {},
      [MOUNTABLE]: true as const,
    } as unknown as Mountable;
    const m = buildDeploymentManifest(
      "api",
      "ns",
      "api",
      {
        image: "test",
        mounts: [{ source: vol, path: "/data" }],
      },
      emptySecrets,
    );
    const containers = m.spec.template.spec["containers"] as Record<
      string,
      unknown
    >[];
    const mounts = containers[0]?.["volumeMounts"] as {
      name: string;
      mountPath: string;
    }[];
    strictEqual(mounts.length, 1);
    strictEqual(mounts[0]?.name, "vol-data");
    strictEqual(mounts[0]?.mountPath, "/data");
    const volumes = m.spec.template.spec["volumes"] as { name: string }[];
    strictEqual(volumes.length, 1);
    strictEqual(volumes[0]?.name, "vol-data");
  });

  it("includes health probes", () => {
    const m = buildDeploymentManifest(
      "api",
      "ns",
      "api",
      {
        image: "test",
        health: {
          command: "curl localhost",
          interval: "10s",
          timeout: "5s",
          retries: 3,
          startPeriod: "30s",
        },
      },
      emptySecrets,
    );
    const containers = m.spec.template.spec["containers"] as Record<
      string,
      unknown
    >[];
    const liveness = containers[0]?.["livenessProbe"] as Record<
      string,
      unknown
    >;
    ok(liveness);
    strictEqual(liveness["periodSeconds"], 10);
    strictEqual(liveness["timeoutSeconds"], 5);
    strictEqual(liveness["failureThreshold"], 3);
    strictEqual(liveness["initialDelaySeconds"], 30);
  });

  it("sets labels correctly", () => {
    const m = buildDeploymentManifest(
      "api",
      "ns",
      "api",
      { image: "test" },
      emptySecrets,
    );
    strictEqual(m.metadata.labels["app.kubernetes.io/name"], "api");
    strictEqual(m.metadata.labels["app.kubernetes.io/managed-by"], "vyft");
  });
});

describe("buildClusterIPManifest", () => {
  it("builds ClusterIP service", () => {
    const m = buildClusterIPManifest("api", "ns", "api", 3000);
    strictEqual(m.metadata.name, "api");
    strictEqual(m.metadata.namespace, "ns");
    strictEqual(m.spec.type, "ClusterIP");
    deepStrictEqual(m.spec.selector, { "app.kubernetes.io/name": "api" });
    strictEqual(m.spec.ports.length, 1);
    strictEqual(m.spec.ports[0]?.port, 3000);
    strictEqual(m.spec.ports[0]?.targetPort, 3000);
  });
});
