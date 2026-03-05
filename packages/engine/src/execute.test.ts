import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { buildURN } from "@vyft/primitives";
import { execute } from "./execute.ts";
import { vol } from "./helpers.test-utils.ts";
import type { Change } from "./plan.ts";

describe("execute", () => {
  it("calls handler with the change", async () => {
    const v = vol("data");
    const change: Change = { status: "create", resource: v };
    const received: Change[] = [];
    await execute(change, async (c) => {
      received.push(c);
    });
    strictEqual(received.length, 1);
    deepStrictEqual(received[0], change);
  });

  it("handles remove changes", async () => {
    const urn = buildURN("platform", "default", "volume", "old");
    const change: Change = { status: "remove", urn };
    const received: Change[] = [];
    await execute(change, async (c) => {
      received.push(c);
    });
    strictEqual(received.length, 1);
    strictEqual(received[0]?.status, "remove");
  });

  it("propagates handler errors", async () => {
    const v = vol("data");
    const change: Change = { status: "create", resource: v };
    let caught: Error | null = null;
    try {
      await execute(change, async () => {
        throw new Error("boom");
      });
    } catch (err) {
      caught = err as Error;
    }
    strictEqual(caught?.message, "boom");
  });
});
