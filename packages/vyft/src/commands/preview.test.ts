import { ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { buildURN, MOUNTABLE } from "@vyft/core";
import type { StateEntry } from "@vyft/engine";
import { collect, fingerprint, plan } from "@vyft/engine";

function vol(id: string, config: Record<string, unknown> = {}) {
  return { kind: "volume" as const, id, config, [MOUNTABLE]: true as const };
}

function sec(id: string) {
  return { kind: "variable" as const, id, config: {} };
}

function makeStateEntry(id: string, kind: string, fp: string): StateEntry {
  const module =
    kind === "volume" || kind === "variable" ? "platform" : "runtime";
  return {
    urn: buildURN(module, "default", kind, id),
    fingerprint: fp,
    inputs: {},
  };
}

describe("preview logic", () => {
  it("detects creates on first deploy", () => {
    const v = vol("data");
    const s = sec("pass");

    const resources = collect({ v, s });
    const changes = plan(resources, []).flat();

    strictEqual(changes.length, 2);
    ok(changes.every((c) => c.status === "create"));
  });

  it("detects no changes when state matches", () => {
    const v = vol("data");

    const resources = collect({ v });

    const state = [makeStateEntry("data", "volume", fingerprint(v))];
    const changes = plan(resources, state).flat();
    strictEqual(changes.length, 0);
  });

  it("detects modifications", () => {
    const v = vol("data", { size: "10Gi" });

    const resources = collect({ v });

    const state = [makeStateEntry("data", "volume", "old-fingerprint")];
    const changes = plan(resources, state).flat();

    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "modify");
  });

  it("detects removals", () => {
    const resources = collect({});

    const state = [makeStateEntry("data", "volume", "fp")];
    const changes = plan(resources, state).flat();

    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "remove");
  });

  it("detects mixed creates, modifies, and removes", () => {
    const existing = vol("existing");
    const modified = vol("modified", { size: "20Gi" });
    const added = sec("new-secret");

    const resources = collect({ existing, modified, added });

    const state = [
      makeStateEntry("existing", "volume", fingerprint(existing)),
      makeStateEntry("modified", "volume", "old-fp"),
      makeStateEntry("removed", "variable", "fp"),
    ];

    const changes = plan(resources, state).flat();

    const creates = changes.filter((c) => c.status === "create");
    const modifies = changes.filter((c) => c.status === "modify");
    const removes = changes.filter((c) => c.status === "remove");

    strictEqual(creates.length, 1);
    strictEqual(modifies.length, 1);
    strictEqual(removes.length, 1);
  });
});
