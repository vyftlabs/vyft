import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { CliError, projectInfo } from "@vyft/core";
import * as log from "@vyft/core/logger";
import { createFileStore } from "@vyft/store";
import type { Command } from "commander";

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function registerCancel(program: Command): void {
  program
    .command("cancel")
    .description("Clear a stale lock and pending operations")
    .action(async () => {
      const { root, context, project } = await projectInfo();
      const store = createFileStore(root);

      const lock = await store.inspectLock(context, project);

      if (lock && isProcessAlive(lock.pid)) {
        throw new CliError(
          `State is locked by PID ${lock.pid} which is still running. ` +
            `Kill the process first, then re-run \`vyft cancel\`.`,
        );
      }

      let cleared = false;

      if (lock) {
        await store.clearLock(context, project);
        log.step("clear", `stale lock (PID ${lock.pid})`);
        cleared = true;
      }

      if (await store.hasWAL(context, project)) {
        const walFile = join(root, context, project, "wal.jsonl");
        await unlink(walFile).catch((err: unknown) => {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        });
        log.step("clear", "pending operations (WAL)");
        cleared = true;
      }

      if (!cleared) {
        log.info("nothing to cancel");
      }
    });
}
