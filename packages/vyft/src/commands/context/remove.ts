import { confirm, isCancel, select } from "@clack/prompts";
import { Command } from "commander";
import { readContexts, removeContext } from "../../contexts.ts";
import { cancel } from "../../utils/prompts.ts";

export default new Command("remove")
  .alias("rm")
  .description("Remove a context")
  .argument("[name]", "Context name")
  .option("-y, --yes", "Skip confirmation")
  .action(async (nameArg?: string, opts?: { yes?: boolean }) => {
    const cwd = process.cwd();
    const data = await readContexts(cwd);
    const names = Object.keys(data.contexts);

    if (names.length === 0) {
      console.log("No contexts to remove.");
      return;
    }

    const name =
      nameArg ??
      (await (async () => {
        const answer = await select({
          message: "Remove context",
          options: names.map((n) => ({ value: n, label: n })),
        });
        if (isCancel(answer)) cancel();
        return answer;
      })());

    if (!opts?.yes) {
      const ok = await confirm({ message: `Remove context "${name}"?` });
      if (isCancel(ok) || !ok) cancel();
    }

    await removeContext(cwd, name);
    console.log(`Context "${name}" removed.`);
  });
