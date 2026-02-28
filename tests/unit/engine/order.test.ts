import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { buildGraph } from "../../../src/engine/graph.ts";
import { levels, order } from "../../../src/engine/order.ts";
import { sec, svc, vol } from "./helpers.ts";

describe("order", () => {
  it("returns empty for an empty graph", () => {
    deepStrictEqual(order(buildGraph([])), []);
  });

  it("returns a single resource", () => {
    const v = vol("data");
    deepStrictEqual(order(buildGraph([v])), [v]);
  });

  it("places dependencies before dependents", () => {
    const db = svc("db");
    const api = svc("api", { image: "node", dependsOn: [db] });
    const sorted = order(buildGraph([api, db]));
    ok(sorted.indexOf(db) < sorted.indexOf(api), "db should come before api");
  });

  it("handles a linear chain", () => {
    const a = svc("a");
    const b = svc("b", { image: "test", dependsOn: [a] });
    const c = svc("c", { image: "test", dependsOn: [b] });
    const ids = order(buildGraph([c, b, a])).map((r) => r.id);
    ok(ids.indexOf("a") < ids.indexOf("b"));
    ok(ids.indexOf("b") < ids.indexOf("c"));
  });

  it("handles diamond dependencies", () => {
    const d = vol("d");
    const b = svc("b", { image: "test", mounts: [{ volume: d, path: "/d" }] });
    const c = svc("c", { image: "test", mounts: [{ volume: d, path: "/d" }] });
    const a = svc("a", { image: "test", dependsOn: [b, c] });
    const ids = order(buildGraph([a, b, c, d])).map((r) => r.id);
    ok(ids.indexOf("d") < ids.indexOf("b"));
    ok(ids.indexOf("d") < ids.indexOf("c"));
    ok(ids.indexOf("b") < ids.indexOf("a"));
    ok(ids.indexOf("c") < ids.indexOf("a"));
  });

  it("includes all independent resources", () => {
    const sorted = order(buildGraph([vol("a"), sec("b"), svc("c")]));
    strictEqual(sorted.length, 3);
  });
});

describe("levels", () => {
  it("returns empty for an empty graph", () => {
    deepStrictEqual(levels(buildGraph([])), []);
  });

  it("returns a single level for a single resource", () => {
    const v = vol("data");
    const result = levels(buildGraph([v]));
    strictEqual(result.length, 1);
    deepStrictEqual(result[0], [v]);
  });

  it("places all independent resources in one level", () => {
    const a = vol("a");
    const b = sec("b");
    const c = svc("c");
    const result = levels(buildGraph([a, b, c]));
    strictEqual(result.length, 1);
    strictEqual(result[0]?.length, 3);
  });

  it("separates dependencies into different levels", () => {
    const db = svc("db");
    const api = svc("api", { image: "node", dependsOn: [db] });
    const result = levels(buildGraph([api, db]));
    strictEqual(result.length, 2);
    deepStrictEqual(
      result[0]?.map((r) => r.id),
      ["db"],
    );
    deepStrictEqual(
      result[1]?.map((r) => r.id),
      ["api"],
    );
  });

  it("handles a linear chain", () => {
    const a = svc("a");
    const b = svc("b", { image: "test", dependsOn: [a] });
    const c = svc("c", { image: "test", dependsOn: [b] });
    const result = levels(buildGraph([c, b, a]));
    strictEqual(result.length, 3);
    deepStrictEqual(
      result[0]?.map((r) => r.id),
      ["a"],
    );
    deepStrictEqual(
      result[1]?.map((r) => r.id),
      ["b"],
    );
    deepStrictEqual(
      result[2]?.map((r) => r.id),
      ["c"],
    );
  });

  it("handles diamond dependencies", () => {
    const d = vol("d");
    const b = svc("b", { image: "test", mounts: [{ volume: d, path: "/d" }] });
    const c = svc("c", { image: "test", mounts: [{ volume: d, path: "/d" }] });
    const a = svc("a", { image: "test", dependsOn: [b, c] });
    const result = levels(buildGraph([a, b, c, d]));
    strictEqual(result.length, 3);
    deepStrictEqual(
      result[0]?.map((r) => r.id),
      ["d"],
    );
    const level1Ids = result[1]?.map((r) => r.id).sort();
    deepStrictEqual(level1Ids, ["b", "c"]);
    deepStrictEqual(
      result[2]?.map((r) => r.id),
      ["a"],
    );
  });
});
