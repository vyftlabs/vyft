import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeDockerContainer } from "./inspect.ts";

const baseInspect = {
  Id: "abc123",
  Name: "/test",
  Config: {
    Image: "nginx:latest",
    Env: [],
    ExposedPorts: { "80/tcp": {} },
  },
  HostConfig: {},
  State: { Status: "running", Running: true },
};

describe("normalizeDockerContainer", () => {
  it("parses a simple bind mount without options", () => {
    const result = normalizeDockerContainer({
      ...baseInspect,
      HostConfig: { Binds: ["/host/data:/container/data"] },
    });
    assert.deepEqual(result.mounts, [
      { source: "/host/data", target: "/container/data" },
    ]);
  });

  it("strips mount options like :ro from target path", () => {
    const result = normalizeDockerContainer({
      ...baseInspect,
      HostConfig: { Binds: ["/host/data:/container/data:ro"] },
    });
    assert.deepEqual(result.mounts, [
      { source: "/host/data", target: "/container/data" },
    ]);
  });

  it("handles multiple bind mounts with mixed options", () => {
    const result = normalizeDockerContainer({
      ...baseInspect,
      HostConfig: {
        Binds: [
          "/host/a:/container/a:ro",
          "/host/b:/container/b",
          "/host/c:/container/c:rw,z",
        ],
      },
    });
    assert.deepEqual(result.mounts, [
      { source: "/host/a", target: "/container/a" },
      { source: "/host/b", target: "/container/b" },
      { source: "/host/c", target: "/container/c" },
    ]);
  });

  it("returns undefined mounts when Binds is empty", () => {
    const result = normalizeDockerContainer({
      ...baseInspect,
      HostConfig: { Binds: [] },
    });
    assert.equal(result.mounts, undefined);
  });
});
