import { strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";
import {
  durationToMs,
  durationToNanos,
  durationToSeconds,
  nanosToDigits,
} from "../../../src/runtimes/duration.ts";

describe("durationToMs", () => {
  it("parses milliseconds", () => {
    strictEqual(durationToMs("100ms"), 100);
  });

  it("parses seconds", () => {
    strictEqual(durationToMs("5s"), 5_000);
  });

  it("parses minutes", () => {
    strictEqual(durationToMs("2m"), 120_000);
  });

  it("parses hours", () => {
    strictEqual(durationToMs("1h"), 3_600_000);
  });

  it("throws on invalid input", () => {
    throws(() => durationToMs("abc"), /Invalid duration/);
    throws(() => durationToMs("10"), /Invalid duration/);
    throws(() => durationToMs("10d"), /Invalid duration/);
  });
});

describe("durationToNanos", () => {
  it("converts seconds to nanoseconds", () => {
    strictEqual(durationToNanos("1s"), 1_000_000_000);
  });

  it("converts milliseconds to nanoseconds", () => {
    strictEqual(durationToNanos("500ms"), 500_000_000);
  });
});

describe("durationToSeconds", () => {
  it("converts seconds", () => {
    strictEqual(durationToSeconds("10s"), 10);
  });

  it("converts milliseconds and rounds up", () => {
    strictEqual(durationToSeconds("1500ms"), 2);
  });

  it("converts minutes", () => {
    strictEqual(durationToSeconds("2m"), 120);
  });
});

describe("nanosToDigits", () => {
  it("converts zero", () => {
    strictEqual(nanosToDigits(0), "0s");
  });

  it("converts seconds", () => {
    strictEqual(nanosToDigits(10_000_000_000), "10s");
  });

  it("converts minutes", () => {
    strictEqual(nanosToDigits(120_000_000_000), "2m");
  });

  it("converts hours", () => {
    strictEqual(nanosToDigits(3_600_000_000_000), "1h");
  });

  it("converts milliseconds", () => {
    strictEqual(nanosToDigits(500_000_000), "500ms");
  });

  it("round-trips with durationToNanos", () => {
    for (const d of ["1s", "30s", "5m", "2h", "500ms"]) {
      strictEqual(nanosToDigits(durationToNanos(d)), d);
    }
  });
});
