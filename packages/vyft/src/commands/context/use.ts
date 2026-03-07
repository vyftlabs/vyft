import { isCancel, select } from "@clack/prompts";
import { Command } from "commander";
import { readContexts, useContext } from "../../contexts.ts";
import { cancel } from "../../utils/prompts.ts";

export default new Command("use")
  .description("Switch to a context")
  .argument("[name]", "Context name")
  .action(async (nameArg?: string) => {
    const cwd = process.cwd();
    const data = await readContexts(cwd);
    const names = Object.keys(data.contexts);

    if (names.length === 0) {
      console.log("No contexts configured. Run `vyft context add` to create one.");
      return;
    }

    const name =
      nameArg ??
      (await (async () => {
        const answer = await select({
          message: "Switch to",
          options: names.map((n) => ({
            value: n,
            label: n === data.current ? `${n} (current)` : n,
          })),
        });
        if (isCancel(answer)) cancel();
        return answer;
      })());

    await useContext(cwd, name);
    console.log(`Switched to context "${name}".`);
  });
