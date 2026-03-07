import { execSync } from "node:child_process";
import { spinner } from "@clack/prompts";
import { Command } from "commander";
import { addContext } from "../../contexts.ts";
import { detectPackageManager } from "../../utils/pm.ts";

const BUILTIN_PROVIDERS = new Set(["local", "docker"]);

function packagesToInstall(providers: string[]): string[] {
  return providers
    .filter((p) => !BUILTIN_PROVIDERS.has(p))
    .map((p) => `@vyft/${p}`);
}

export default new Command("add")
  .alias("a")
  .description("Add a context")
  .argument("<name>", "Context name")
  .requiredOption("--platform <platform>", "Platform (e.g. aws, gcp, azure)")
  .requiredOption("--runtime <runtime>", "Runtime (e.g. ecr, ecs, k8s)")
  .action(async (name: string, opts: { platform: string; runtime: string }) => {
    const cwd = process.cwd();

    const pkgs = packagesToInstall([opts.platform, opts.runtime]);
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

    await addContext(cwd, name, {
      platform: opts.platform,
      runtime: opts.runtime,
    });
    console.log(`Context "${name}" added.`);
  });
