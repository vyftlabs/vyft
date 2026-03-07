import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WALCorruptedError } from "./error.ts";
import { parseWAL } from "./wal.ts";

describe("parseWAL", () => {
  it("parses valid entries", () => {
    const lines = [
      JSON.stringify({ type: "set", key: "a", data: 1 }),
      JSON.stringify({ type: "remove", key: "b" }),
    ].join("\n");

    const entries = parseWAL(lines);
    assert.equal(entries.length, 2);
    assert.deepEqual(entries[0], { type: "set", key: "a", data: 1 });
    assert.deepEqual(entries[1], { type: "remove", key: "b" });
  });

  it("returns empty array for empty string", () => {
    assert.deepEqual(parseWAL(""), []);
  });

  it("returns empty array for whitespace-only input", () => {
    assert.deepEqual(parseWAL("\n\n\n"), []);
  });

  it("skips malformed JSON lines and recovers valid entries after them", () => {
    const lines = [
      JSON.stringify({ type: "set", key: "a", data: 1 }),
      "CORRUPT LINE",
      JSON.stringify({ type: "set", key: "b", data: 2 }),
    ].join("\n");

    const entries = parseWAL(lines);
    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.key, "a");
    assert.equal(entries[1]?.key, "b");
  });

  it("recovers valid entries after corrupt first line", () => {
    const lines = [
      "CORRUPT FIRST LINE",
      JSON.stringify({ type: "set", key: "a", data: 1 }),
      JSON.stringify({ type: "set", key: "b", data: 2 }),
    ].join("\n");

    const entries = parseWAL(lines);
    assert.equal(entries.length, 2);
  });

  it("recovers valid entries scattered around multiple corrupt lines", () => {
    const lines = [
      JSON.stringify({ type: "set", key: "a", data: 1 }),
      JSON.stringify({ type: "set", key: "b", data: 2 }),
      "CORRUPT",
      JSON.stringify({ type: "set", key: "c", data: 3 }),
      JSON.stringify({ type: "set", key: "d", data: 4 }),
    ].join("\n");

    const entries = parseWAL(lines);
    assert.equal(entries.length, 4);
  });

  it("throws WALCorruptedError on valid JSON with wrong schema", () => {
    const lines = `${JSON.stringify({ type: "unknown", key: "a" })}\n`;

    assert.throws(
      () => parseWAL(lines),
      (err: unknown) => err instanceof WALCorruptedError,
    );
  });
});
