import { execSync } from "node:child_process";
import { isCancel, select, spinner } from "@clack/prompts";
import { Command } from "commander";
import { addContext } from "../../contexts.ts";
import { detectPackageManager } from "../../utils/pm.ts";
import { cancel } from "../../utils/prompts.ts";

const BUILTIN_PROVIDERS = new Set(["local", "docker"]);

function packagesToInstall(providers: string[]): string[] {
  return providers
    .filter((p) => !BUILTIN_PROVIDERS.has(p))
    .map((p) => `@vyft/${p}`);
}

const PLATFORMS = [
  { value: "local", label: "Local (Docker Compose-style)" },
  { value: "aws", label: "AWS" },
  { value: "gcp", label: "GCP" },
  { value: "azure", label: "Azure" },
];

const RUNTIMES = [
  { value: "docker", label: "Docker" },
  { value: "ecs", label: "AWS ECS" },
  { value: "k8s", label: "Kubernetes" },
];

export default new Command("add")
  .alias("a")
  .description("Add a context")
  .argument("<name>", "Context name")
  .option("--platform <platform>", "Platform (e.g. local, aws, gcp, azure)")
  .option("--runtime <runtime>", "Runtime (e.g. docker, ecs, k8s)")
  .action(
    async (
      name: string,
      opts: { platform?: string; runtime?: string },
    ) => {
      const cwd = process.cwd();

      const platform =
        opts.platform ??
        (await (async () => {
          const answer = await select({
            message: "Platform",
            options: PLATFORMS,
          });
          if (isCancel(answer)) cancel();
          return answer;
        })());

      const runtime =
        opts.runtime ??
        (await (async () => {
          const answer = await select({
            message: "Runtime",
            options: RUNTIMES,
          });
          if (isCancel(answer)) cancel();
          return answer;
        })());

      const pkgs = packagesToInstall([platform, runtime]);
      if (pkgs.length > 0) {
        const pm = await detectPackageManager(cwd);
        const s = spinner();
        s.start(`Installing ${pkgs.join(", ")}`);
        try {
          execSync(`${pm} add ${pkgs.join(" ")}`, { cwd, stdio: "pipe" });
          s.stop(`Installed ${pkgs.join(", ")}`);
        } catch {
          s.stop(`Failed to install ${pkgs.join(", ")}`);
          process.exit(1);
        }
      }

      await addContext(cwd, name, { platform, runtime });
      console.log(`Context "${name}" added.`);
    },
  );
