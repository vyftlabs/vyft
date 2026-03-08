import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execute } from "./execute.ts";
import type { Change, Dispatcher } from "./types.ts";

function makeDispatcher(
  handler: (change: Change) => Promise<void>,
): Dispatcher {
  return { dispatch: handler };
}

describe("execute", () => {
  it("dispatches all changes in each step", async () => {
    const dispatched: string[] = [];
    const dispatcher = makeDispatcher(async (change) => {
      dispatched.push(change.urn);
    });

    const plan: Change[][] = [
      [
        { urn: "a", action: "create" },
        { urn: "b", action: "create" },
      ],
      [{ urn: "c", action: "update" }],
    ];

    await execute(plan, dispatcher);
    assert.deepEqual(dispatched.sort(), ["a", "b", "c"]);
  });

  it("awaits all dispatches in a step before proceeding to the next", async () => {
    const order: string[] = [];
    const dispatcher = makeDispatcher(async (change) => {
      order.push(`start:${change.urn}`);
      await Promise.resolve();
      order.push(`end:${change.urn}`);
    });

    const plan: Change[][] = [
      [{ urn: "step1", action: "create" }],
      [{ urn: "step2", action: "create" }],
    ];

    await execute(plan, dispatcher);
    assert.ok(
      order.indexOf("end:step1") < order.indexOf("start:step2"),
      "step1 must finish before step2 starts",
    );
  });

  it("throws AggregateError when one dispatch fails", async () => {
    const err = new Error("dispatch failed");
    const dispatcher = makeDispatcher(async () => {
      throw err;
    });

    const plan: Change[][] = [[{ urn: "a", action: "create" }]];

    await assert.rejects(
      () => execute(plan, dispatcher),
      (thrown: unknown) => {
        assert.ok(thrown instanceof AggregateError);
        assert.deepEqual(thrown.errors, [err]);
        return true;
      },
    );
  });

  it("collects all failures in the step into one AggregateError", async () => {
    const errA = new Error("a failed");
    const errB = new Error("b failed");
    const dispatcher = makeDispatcher(async (change) => {
      if (change.urn === "a") throw errA;
      if (change.urn === "b") throw errB;
    });

    const plan: Change[][] = [
      [
        { urn: "a", action: "create" },
        { urn: "b", action: "create" },
      ],
    ];

    await assert.rejects(
      () => execute(plan, dispatcher),
      (thrown: unknown) => {
        assert.ok(thrown instanceof AggregateError);
        assert.deepEqual(thrown.errors.sort(), [errA, errB].sort());
        return true;
      },
    );
  });

  it("does not execute subsequent steps after a failure", async () => {
    const dispatched: string[] = [];
    const dispatcher = makeDispatcher(async (change) => {
      if (change.urn === "fail") throw new Error("failed");
      dispatched.push(change.urn);
    });

    const plan: Change[][] = [
      [{ urn: "fail", action: "create" }],
      [{ urn: "should-not-run", action: "create" }],
    ];

    await assert.rejects(() => execute(plan, dispatcher));
    assert.deepEqual(dispatched, []);
  });
});
