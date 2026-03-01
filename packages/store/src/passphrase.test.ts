import { strictEqual } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resolvePassphrase } from "./passphrase.ts";

describe("resolvePassphrase", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env["VYFT_PASSPHRASE"];
    delete process.env["VYFT_PASSPHRASE"];
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env["VYFT_PASSPHRASE"] = savedEnv;
    } else {
      delete process.env["VYFT_PASSPHRASE"];
    }
  });

  it("returns env var when set", async () => {
    process.env["VYFT_PASSPHRASE"] = "from-env";
    strictEqual(await resolvePassphrase(), "from-env");
  });

  it("returns env var value exactly", async () => {
    process.env["VYFT_PASSPHRASE"] = "  spaces  ";
    strictEqual(await resolvePassphrase(), "  spaces  ");
  });
});
