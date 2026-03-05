import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { buildServiceSpec } from "./service.ts";

const emptySecrets = new Map<string, string>();

describe("buildServiceSpec", () => {
  it("builds basic spec with image", () => {
    const spec = buildServiceSpec(
      "vyft-test-api",
      "api",
      { image: "node:22" },
      "net-id",
      emptySecrets,
    );
    strictEqual(spec.Name, "vyft-test-api");
    strictEqual(spec.TaskTemplate.ContainerSpec.Image, "node:22");
    strictEqual(spec.Mode.Replicated.Replicas, 1);
    strictEqual(spec.TaskTemplate.Networks[0]?.Target, "net-id");
    deepStrictEqual(spec.TaskTemplate.Networks[0]?.Aliases, ["api"]);
  });

  it("uses registry-derived image when no image specified", () => {
    const spec = buildServiceSpec(
      "vyft-test-api",
      "api",
      { path: "./app" },
      "net-id",
      emptySecrets,
    );
    strictEqual(
      spec.TaskTemplate.ContainerSpec.Image,
      "127.0.0.1:5000/vyft-api:latest",
    );
  });

  it("sets replicas from config", () => {
    const spec = buildServiceSpec(
      "svc",
      "api",
      { image: "test", replicas: 3 },
      "net",
      emptySecrets,
    );
    strictEqual(spec.Mode.Replicated.Replicas, 3);
  });

  it("resolves env vars", () => {
    const secrets = new Map([["pass", "s3cret"]]);
    const spec = buildServiceSpec(
      "svc",
      "api",
      {
        image: "test",
        env: { FOO: "bar", PASS: { kind: "variable", id: "pass" } },
      },
      "net",
      secrets,
    );
    ok(spec.TaskTemplate.ContainerSpec.Env?.includes("FOO=bar"));
    ok(spec.TaskTemplate.ContainerSpec.Env?.includes("PASS=s3cret"));
  });

  it("sets command", () => {
    const spec = buildServiceSpec(
      "svc",
      "api",
      { image: "test", command: ["node", "app.js"] },
      "net",
      emptySecrets,
    );
    deepStrictEqual(spec.TaskTemplate.ContainerSpec.Command, [
      "node",
      "app.js",
    ]);
  });

  it("maps restart policies", () => {
    const none = buildServiceSpec(
      "s",
      "a",
      { image: "x", restart: "none" },
      "n",
      emptySecrets,
    );
    strictEqual(none.TaskTemplate.RestartPolicy.Condition, "none");
    const onFailure = buildServiceSpec(
      "s",
      "a",
      { image: "x", restart: "on-failure" },
      "n",
      emptySecrets,
    );
    strictEqual(onFailure.TaskTemplate.RestartPolicy.Condition, "on-failure");
    const always = buildServiceSpec(
      "s",
      "a",
      { image: "x", restart: "always" },
      "n",
      emptySecrets,
    );
    strictEqual(always.TaskTemplate.RestartPolicy.Condition, "any");
  });

  it("includes healthcheck when configured", () => {
    const spec = buildServiceSpec(
      "svc",
      "api",
      {
        image: "test",
        health: { command: "curl localhost", interval: "10s", retries: 3 },
      },
      "net",
      emptySecrets,
    );
    ok(spec.TaskTemplate.ContainerSpec.Healthcheck);
    deepStrictEqual(spec.TaskTemplate.ContainerSpec.Healthcheck?.["Test"], [
      "CMD-SHELL",
      "curl localhost",
    ]);
    strictEqual(
      spec.TaskTemplate.ContainerSpec.Healthcheck?.["Interval"],
      10_000_000_000,
    );
    strictEqual(spec.TaskTemplate.ContainerSpec.Healthcheck?.["Retries"], 3);
  });
});
