import { doesNotThrow, throws } from "node:assert";
import { describe, it } from "node:test";
import { buildGraph } from "./graph.ts";
import { sec, svc, vol } from "./helpers.test-utils.ts";
import { validate } from "./validate.ts";

describe("validate", () => {
  it("passes for an empty graph", () => {
    doesNotThrow(() => validate(buildGraph([])));
  });

  it("passes for a valid acyclic graph", () => {
    const v = vol("data");
    const s = sec("pass");
    const db = svc("db");
    const api = svc("api", {
      image: "node",
      dependsOn: [db],
      mounts: [{ volume: v, path: "/data" }],
      env: { SECRET: s },
    });
    doesNotThrow(() => validate(buildGraph([v, s, db, api])));
  });

  it("throws on a dangling dependency", () => {
    const graph = {
      resources: new Map([["api", svc("api")]]),
      dependencies: new Map([["api", new Set(["missing"])]]),
    };
    throws(() => validate(graph), /does not exist/);
  });

  it("throws on a direct cycle", () => {
    const graph = {
      resources: new Map([
        ["a", svc("a")],
        ["b", svc("b")],
      ]),
      dependencies: new Map([
        ["a", new Set(["b"])],
        ["b", new Set(["a"])],
      ]),
    };
    throws(() => validate(graph), /cycle/i);
  });

  it("throws on a transitive cycle", () => {
    const graph = {
      resources: new Map([
        ["a", svc("a")],
        ["b", svc("b")],
        ["c", svc("c")],
      ]),
      dependencies: new Map([
        ["a", new Set(["b"])],
        ["b", new Set(["c"])],
        ["c", new Set(["a"])],
      ]),
    };
    throws(() => validate(graph), /cycle/i);
  });

  it("includes cycle path in error", () => {
    const graph = {
      resources: new Map([
        ["a", svc("a")],
        ["b", svc("b")],
      ]),
      dependencies: new Map([
        ["a", new Set(["b"])],
        ["b", new Set(["a"])],
      ]),
    };
    throws(() => validate(graph), /→/);
  });

  it("throws on self-referencing dependency", () => {
    const graph = {
      resources: new Map([["a", svc("a")]]),
      dependencies: new Map([["a", new Set(["a"])]]),
    };
    throws(() => validate(graph), /cycle/i);
  });

  it("detects cycle in subgraph with acyclic nodes", () => {
    const graph = {
      resources: new Map([
        ["a", svc("a")],
        ["b", svc("b")],
        ["c", svc("c")],
      ]),
      dependencies: new Map([
        ["a", new Set(["b"])],
        ["b", new Set(["c"])],
        ["c", new Set(["b"])],
      ]),
    };
    throws(() => validate(graph), /b → c → b/);
  });

  it("passes for independent resources with no dependencies", () => {
    doesNotThrow(() => validate(buildGraph([vol("a"), sec("b"), svc("c")])));
  });
});
