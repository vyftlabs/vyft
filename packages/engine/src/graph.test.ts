import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { interpolate } from "@vyft/core";
import { buildGraph, collect } from "./graph.ts";
import { sec, svc, vol } from "./helpers.test-utils.ts";

describe("collect", () => {
  it("discovers resources from a flat object", () => {
    const v = vol("data");
    const s = sec("pass");
    const a = svc("api");
    deepStrictEqual(collect({ v, s, a }), [v, s, a]);
  });

  it("discovers resources from arrays", () => {
    const v = vol("data");
    deepStrictEqual(collect([v]), [v]);
  });

  it("discovers deeply nested resources", () => {
    const v = vol("data");
    deepStrictEqual(collect({ a: { b: { c: v } } }), [v]);
  });

  it("deduplicates shared references", () => {
    const v = vol("data");
    deepStrictEqual(collect({ a: v, b: v }), [v]);
  });

  it("discovers nested resources inside service config", () => {
    const v = vol("data");
    const s = sec("pass");
    const a = svc("api", {
      image: "node",
      mounts: [{ source: v, path: "/data" }],
      env: { SECRET: s },
    });
    const result = collect(a);
    strictEqual(result.length, 3);
    ok(result.includes(a));
    ok(result.includes(v));
    ok(result.includes(s));
  });

  it("returns empty for primitives and nulls", () => {
    deepStrictEqual(collect("hello"), []);
    deepStrictEqual(collect(42), []);
    deepStrictEqual(collect(null), []);
    deepStrictEqual(collect(undefined), []);
  });

  it("ignores objects with unknown kind values", () => {
    deepStrictEqual(collect({ kind: "unknown", id: "x" }), []);
    deepStrictEqual(collect({ kind: 42 }), []);
  });

  it("returns empty for empty objects and arrays", () => {
    deepStrictEqual(collect({}), []);
    deepStrictEqual(collect([]), []);
  });
});

describe("buildGraph", () => {
  it("maps resources by id", () => {
    const v = vol("data");
    const s = sec("pass");
    const graph = buildGraph([v, s]);
    strictEqual(graph.resources.get("data"), v);
    strictEqual(graph.resources.get("pass"), s);
  });

  it("gives volumes and secrets empty dependency sets", () => {
    const graph = buildGraph([vol("data"), sec("pass")]);
    strictEqual(graph.dependencies.get("data")?.size, 0);
    strictEqual(graph.dependencies.get("pass")?.size, 0);
  });

  it("captures dependsOn references", () => {
    const db = svc("db");
    const api = svc("api", { image: "node", dependsOn: [db] });
    const graph = buildGraph([db, api]);
    ok(graph.dependencies.get("api")?.has("db"));
  });

  it("captures mount volume references", () => {
    const v = vol("data");
    const api = svc("api", {
      image: "node",
      mounts: [{ source: v, path: "/data" }],
    });
    const graph = buildGraph([v, api]);
    ok(graph.dependencies.get("api")?.has("data"));
  });

  it("captures env secret references", () => {
    const s = sec("pass");
    const api = svc("api", { image: "node", env: { SECRET: s } });
    const graph = buildGraph([s, api]);
    ok(graph.dependencies.get("api")?.has("pass"));
  });

  it("captures env interpolation references", () => {
    const s = sec("pass");
    const api = svc("api", {
      image: "node",
      env: { URL: interpolate`pg://${s}@db` },
    });
    const graph = buildGraph([s, api]);
    ok(graph.dependencies.get("api")?.has("pass"));
  });

  it("ignores plain string env values in deps", () => {
    const api = svc("api", { image: "node", env: { HOST: "localhost" } });
    const graph = buildGraph([api]);
    strictEqual(graph.dependencies.get("api")?.size, 0);
  });

  it("combines all dependency types", () => {
    const v = vol("data");
    const s = sec("pass");
    const db = svc("db");
    const api = svc("api", {
      image: "node",
      dependsOn: [db],
      mounts: [{ source: v, path: "/data" }],
      env: { SECRET: s },
    });
    const graph = buildGraph([v, s, db, api]);
    const deps = graph.dependencies.get("api");
    ok(deps, "api dependencies should exist");
    ok(deps.has("db"));
    ok(deps.has("data"));
    ok(deps.has("pass"));
    strictEqual(deps.size, 3);
  });
});
