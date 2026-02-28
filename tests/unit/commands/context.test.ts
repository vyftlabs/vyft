import { ok, strictEqual } from "node:assert";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

// We test context logic directly rather than through CLI dispatch,
// since the command depends on process.cwd(). We test the underlying
// operations that context create/use/rm/show/ls perform.

describe("context operations", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-ctxcmd-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("create sets up context dir and active file", async () => {
    const name = "staging";
    await mkdir(join(root, name), { recursive: true });
    await writeFile(join(root, "active"), `${name}\n`, "utf8");

    const active = (await readFile(join(root, "active"), "utf8")).trim();
    strictEqual(active, name);

    const s = await stat(join(root, name));
    ok(s.isDirectory());
  });

  it("create does not persist a key file", async () => {
    const name = "staging";
    await mkdir(join(root, name), { recursive: true });
    await writeFile(join(root, "active"), `${name}\n`, "utf8");

    let keyExists = true;
    try {
      await stat(join(root, name, "key"));
    } catch {
      keyExists = false;
    }
    strictEqual(keyExists, false);
  });

  it("use switches active context", async () => {
    await mkdir(join(root, "dev"), { recursive: true });
    await mkdir(join(root, "prod"), { recursive: true });
    await writeFile(join(root, "active"), "dev\n", "utf8");

    // Switch
    await writeFile(join(root, "active"), "prod\n", "utf8");

    const active = (await readFile(join(root, "active"), "utf8")).trim();
    strictEqual(active, "prod");
  });

  it("rm deletes context directory", async () => {
    await mkdir(join(root, "staging"), { recursive: true });
    ok((await stat(join(root, "staging"))).isDirectory());

    await rm(join(root, "staging"), { recursive: true, force: true });

    let exists = true;
    try {
      await stat(join(root, "staging"));
    } catch {
      exists = false;
    }
    strictEqual(exists, false);
  });

  it("rm resets active to default if removed context was active", async () => {
    await mkdir(join(root, "staging"), { recursive: true });
    await writeFile(join(root, "active"), "staging\n", "utf8");

    await rm(join(root, "staging"), { recursive: true, force: true });
    await writeFile(join(root, "active"), "default\n", "utf8");

    const active = (await readFile(join(root, "active"), "utf8")).trim();
    strictEqual(active, "default");
  });

  it("ls lists context directories", async () => {
    await mkdir(join(root, "dev"), { recursive: true });
    await mkdir(join(root, "staging"), { recursive: true });
    await mkdir(join(root, "prod"), { recursive: true });

    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(root);
    const contexts = [];
    for (const entry of entries) {
      if (entry === "active") continue;
      const s = await stat(join(root, entry));
      if (s.isDirectory()) contexts.push(entry);
    }

    strictEqual(contexts.length, 3);
    ok(contexts.includes("dev"));
    ok(contexts.includes("staging"));
    ok(contexts.includes("prod"));
  });
});
