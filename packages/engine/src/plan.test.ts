import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { plan } from "./plan.ts";
import type { State } from "./types.ts";

function stepsUrns(steps: { urn: string; action: string }[][]): string[][] {
  return steps.map((step) => step.map((c) => `${c.urn}:${c.action}`).sort());
}

function before(
  steps: { urn: string; action: string }[][],
  a: string,
  b: string,
): boolean {
  const ai = steps.findIndex((s) =>
    s.some((c) => `${c.urn}:${c.action}` === a),
  );
  const bi = steps.findIndex((s) =>
    s.some((c) => `${c.urn}:${c.action}` === b),
  );
  return ai !== -1 && bi !== -1 && ai < bi;
}

describe("plan", () => {
  it("creates resources with no dependencies in one step", () => {
    const desired: State = {
      entries: {
        a: { urn: "a", input: {} },
        b: { urn: "b", input: {} },
      },
    };
    const current: State = { entries: {} };

    const steps = plan(desired, current);
    assert.equal(steps.length, 1);
    assert.deepEqual(steps[0]?.map((c) => c.urn).sort(), ["a", "b"]);
  });

  it("orders creates by dependency", () => {
    const desired: State = {
      entries: {
        a: { urn: "a", input: {} },
        b: { urn: "b", input: { dep: { urn: "a" } } },
      },
    };
    const current: State = { entries: {} };

    const steps = plan(desired, current);
    assert.ok(before(steps, "a:create", "b:create"));
  });

  it("orders deletes so dependents are deleted before dependencies", () => {
    const current: State = {
      entries: {
        a: { urn: "a", input: {} },
        b: { urn: "b", input: { dep: { urn: "a" } } },
      },
    };
    const desired: State = { entries: {} };

    const steps = plan(desired, current);
    assert.ok(before(steps, "b:delete", "a:delete"));
  });

  it("orders update before delete when updated resource depends on deleted resource", () => {
    // B is being updated and depends on A. A is being deleted.
    // B's update must happen before A is destroyed.
    const current: State = {
      entries: {
        a: { urn: "a", input: {} },
        b: { urn: "b", input: { dep: { urn: "a" } } },
      },
    };
    const desired: State = {
      entries: {
        // A is absent → deleted
        b: { urn: "b", input: { dep: { urn: "a" }, extra: 1 } },
      },
    };

    const steps = plan(desired, current);
    assert.ok(
      before(steps, "b:update", "a:delete"),
      `Expected b:update before a:delete, got: ${JSON.stringify(stepsUrns(steps))}`,
    );
  });

  it("handles mixed creates, updates, and deletes without cross-action dependencies", () => {
    const current: State = {
      entries: {
        old: { urn: "old", input: {} },
        kept: { urn: "kept", input: {} },
      },
    };
    const desired: State = {
      entries: {
        kept: { urn: "kept", input: { changed: true } },
        newone: { urn: "newone", input: {} },
      },
    };

    const steps = plan(desired, current);
    const allActions = steps
      .flat()
      .map((c) => `${c.urn}:${c.action}`)
      .sort();
    assert.deepEqual(allActions, [
      "kept:update",
      "newone:create",
      "old:delete",
    ]);
  });

  it("throws on circular dependencies", () => {
    const desired: State = {
      entries: {
        a: { urn: "a", input: { dep: { urn: "b" } } },
        b: { urn: "b", input: { dep: { urn: "a" } } },
      },
    };
    const current: State = { entries: {} };

    assert.throws(() => plan(desired, current), /circular/i);
  });
});
