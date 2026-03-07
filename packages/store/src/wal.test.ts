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

  it("throws WALCorruptedError on mid-WAL corruption", () => {
    const lines = [
      JSON.stringify({ type: "set", key: "a", data: 1 }),
      "CORRUPT LINE",
      JSON.stringify({ type: "set", key: "b", data: 2 }),
    ].join("\n");

    assert.throws(
      () => parseWAL(lines),
      (err: unknown) => err instanceof WALCorruptedError,
    );
  });

  it("throws WALCorruptedError on corrupt first line when followed by valid entries", () => {
    const lines = [
      "CORRUPT FIRST LINE",
      JSON.stringify({ type: "set", key: "a", data: 1 }),
      JSON.stringify({ type: "set", key: "b", data: 2 }),
    ].join("\n");

    assert.throws(
      () => parseWAL(lines),
      (err: unknown) => err instanceof WALCorruptedError,
    );
  });

  it("tolerates truncated last line (crash recovery)", () => {
    const lines = [
      JSON.stringify({ type: "set", key: "a", data: 1 }),
      JSON.stringify({ type: "set", key: "b", data: 2 }),
      '{"type":"set","key":"c","da',
    ].join("\n");

    const entries = parseWAL(lines);
    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.key, "a");
    assert.equal(entries[1]?.key, "b");
  });

  it("throws WALCorruptedError on valid JSON with wrong schema", () => {
    const lines = `${JSON.stringify({ type: "unknown", key: "a" })}\n`;

    assert.throws(
      () => parseWAL(lines),
      (err: unknown) => err instanceof WALCorruptedError,
    );
  });

  it("should reject set entry with missing data field", () => {
    const walLine = JSON.stringify({ type: "set", key: "ghost" });

    assert.throws(
      () => parseWAL(walLine),
      (err: unknown) => err instanceof WALCorruptedError,
    );
  });
});
