import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { CliError, projectInfo, resolveStage } from "@vyft/core";
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
    .option("--stage <stage>", "Stage to cancel")
    .action(async (opts: { stage?: string }) => {
      const { root, context, project } = await projectInfo();
      const stage = opts.stage ?? (await resolveStage(root));
      const store = createFileStore(root);

      const lock = await store.inspectLock(context, project, stage);

      if (lock && isProcessAlive(lock.pid)) {
        throw new CliError(
          `State is locked by PID ${lock.pid} which is still running. ` +
            `Kill the process first, then re-run \`vyft cancel\`.`,
        );
      }

      let cleared = false;

      if (lock) {
        await store.clearLock(context, project, stage);
        log.step("clear", `stale lock (PID ${lock.pid})`);
        cleared = true;
      }

      if (await store.hasWAL(context, project, stage)) {
        const walFile = join(root, context, project, stage, "wal.jsonl");
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
