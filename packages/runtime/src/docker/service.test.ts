import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { MOUNTABLE } from "@vyft/primitives";
import { buildContainerConfig } from "./service.ts";

const networkName = "vyft-test";
const emptySecrets = new Map<string, string>();

describe("buildContainerConfig", () => {
  it("builds basic config with image", () => {
    const cc = buildContainerConfig(
      "api",
      { image: "node:22" },
      networkName,
      emptySecrets,
    );
    strictEqual(cc.Image, "node:22");
    deepStrictEqual(cc.Env, []);
    strictEqual(cc.Cmd, undefined);
    strictEqual(cc.HostConfig.NetworkMode, networkName);
    strictEqual(cc.HostConfig.RestartPolicy.Name, "always");
    deepStrictEqual(cc.NetworkingConfig.EndpointsConfig[networkName]?.Aliases, [
      "api",
    ]);
  });

  it("resolves env vars", () => {
    const secrets = new Map([["db-pass", "secret123"]]);
    const cc = buildContainerConfig(
      "api",
      {
        image: "node:22",
        env: { FOO: "bar", DB_PASS: { kind: "variable", id: "db-pass" } },
      },
      networkName,
      secrets,
    );
    ok(cc.Env.includes("FOO=bar"));
    ok(cc.Env.includes("DB_PASS=secret123"));
  });

  it("sets command as array", () => {
    const cc = buildContainerConfig(
      "api",
      { image: "node:22", command: ["node", "server.js"] },
      networkName,
      emptySecrets,
    );
    deepStrictEqual(cc.Cmd, ["node", "server.js"]);
  });

  it("wraps string command in sh -c", () => {
    const cc = buildContainerConfig(
      "api",
      { image: "node:22", command: "node server.js" },
      networkName,
      emptySecrets,
    );
    deepStrictEqual(cc.Cmd, ["sh", "-c", "node server.js"]);
  });

  it("sets volume mounts as binds (no project)", () => {
    const vol = {
      kind: "volume" as const,
      id: "data",
      config: {},
      [MOUNTABLE]: true as const,
    };
    const cc = buildContainerConfig(
      "api",
      { image: "node:22", mounts: [{ source: vol, path: "/data" }] },
      networkName,
      emptySecrets,
    );
    deepStrictEqual(cc.HostConfig.Binds, ["data:/data"]);
  });

  it("prefixes volume binds with project name", () => {
    const vol = {
      kind: "volume" as const,
      id: "data",
      config: {},
      [MOUNTABLE]: true as const,
    };
    const cc = buildContainerConfig(
      "api",
      { image: "node:22", mounts: [{ source: vol, path: "/data" }] },
      networkName,
      emptySecrets,
      "myapp",
    );
    deepStrictEqual(cc.HostConfig.Binds, ["vyft-myapp-data:/data"]);
  });

  it("configures healthcheck", () => {
    const cc = buildContainerConfig(
      "api",
      {
        image: "node:22",
        health: {
          command: "curl -f http://localhost:3000/health",
          interval: "10s",
          timeout: "5s",
          retries: 3,
          startPeriod: "30s",
        },
      },
      networkName,
      emptySecrets,
    );
    ok(cc.Healthcheck);
    deepStrictEqual(cc.Healthcheck?.["Test"], [
      "CMD-SHELL",
      "curl -f http://localhost:3000/health",
    ]);
    strictEqual(cc.Healthcheck?.["Interval"], 10_000_000_000);
    strictEqual(cc.Healthcheck?.["Timeout"], 5_000_000_000);
    strictEqual(cc.Healthcheck?.["Retries"], 3);
    strictEqual(cc.Healthcheck?.["StartPeriod"], 30_000_000_000);
  });

  it("maps restart policies", () => {
    const none = buildContainerConfig(
      "a",
      { image: "x", restart: "none" },
      networkName,
      emptySecrets,
    );
    strictEqual(none.HostConfig.RestartPolicy.Name, "");
    const onFailure = buildContainerConfig(
      "b",
      { image: "x", restart: "on-failure" },
      networkName,
      emptySecrets,
    );
    strictEqual(onFailure.HostConfig.RestartPolicy.Name, "on-failure");
    const always = buildContainerConfig(
      "c",
      { image: "x", restart: "always" },
      networkName,
      emptySecrets,
    );
    strictEqual(always.HostConfig.RestartPolicy.Name, "always");
  });

  it("uses build-derived tag when no image specified", () => {
    const cc = buildContainerConfig(
      "api",
      { build: "./app" },
      networkName,
      emptySecrets,
    );
    strictEqual(cc.Image, "vyft-build-api:latest");
  });
});
