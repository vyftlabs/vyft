import fs from "node:fs/promises";
import path from "node:path";
import {
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import { Command } from "commander";
import { addGitignoreEntry, fileExists, isEmptyDir } from "../utils/fs.ts";
import { detectPackageManager } from "../utils/pm.ts";
import { cancel } from "../utils/prompts.ts";
import { copyTemplate, listTemplates } from "../utils/templates.ts";

export default new Command("init")
  .description("Initialize a new vyft project")
  .argument("[name]", "Project name")
  .action(async (nameArg?: string) => {
    intro("vyft init");

    const name =
      nameArg ??
      (await (async () => {
        const answer = await text({
          message: "Project name",
          placeholder: "my-app",
        });
        if (isCancel(answer)) cancel();
        return answer;
      })());

    const dir = path.resolve(name);
    const isCurrentDir = name === ".";

    if (!(await isEmptyDir(dir))) {
      const overwrite = await confirm({
        message: `Directory "${isCurrentDir ? "." : name}" is not empty. Continue anyway?`,
      });
      if (isCancel(overwrite) || !overwrite) cancel();
    }

    const templates = await listTemplates();
    const template = await select({
      message: "Template",
      options: templates.map((t) => ({ value: t, label: t })),
    });
    if (isCancel(template)) cancel();

    const installDeps = await confirm({
      message: "Install dependencies?",
    });
    if (isCancel(installDeps)) cancel();

    let initGit = false;
    if (!(await fileExists(path.join(dir, ".git")))) {
      const gitAnswer = await confirm({
        message: "Initialize a git repository?",
      });
      if (isCancel(gitAnswer)) cancel();
      initGit = gitAnswer;
    }

    await fs.mkdir(dir, { recursive: true });

    const s = spinner();

    s.start("Scaffolding project");
    await copyTemplate(template, dir);
    s.stop("Project scaffolded");

    await addGitignoreEntry(dir);

    if (initGit) {
      s.start("Initializing git repository");
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const exec = promisify(execFile);
      await exec("git", ["init"], { cwd: dir });
      s.stop("Git repository initialized");
    }

    const pm = await detectPackageManager(dir);

    if (installDeps) {
      s.start("Installing dependencies");
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const exec = promisify(execFile);
      try {
        await exec(pm, ["install"], { cwd: dir });
        s.stop("Dependencies installed");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        s.stop("Failed to install dependencies");
        log.warn(msg);
      }
    }

    const nextSteps = [
      ...(isCurrentDir ? [] : [`cd ${name}`]),
      ...(!installDeps ? [`${pm} install`] : []),
      "vyft deploy",
    ];

    note(nextSteps.join("\n"), "Next steps");
    outro("You're all set!");
  });
