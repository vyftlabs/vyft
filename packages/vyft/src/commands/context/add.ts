import { execSync } from "node:child_process";
import { isCancel, select, spinner, text } from "@clack/prompts";
import { Command } from "commander";
import type { ContextEntry } from "../../contexts.ts";
import { addContext } from "../../contexts.ts";
import { detectPackageManager } from "../../utils/pm.ts";
import { cancel } from "../../utils/prompts.ts";

const BUILTIN_PROVIDERS = new Set(["remote", "docker", "test"]);

function packagesToInstall(providers: string[]): string[] {
  return providers
    .filter((p) => !BUILTIN_PROVIDERS.has(p))
    .map((p) => `@vyft/${p}`);
}

interface Option {
  value: string;
  label: string;
}

const PLATFORMS: Option[] = [
  { value: "remote", label: "Remote (SSH / Kubeconfig)" },
  { value: "hetzner", label: "Hetzner Cloud" },
  { value: "aws", label: "AWS" },
  { value: "gcp", label: "GCP" },
];

const RUNTIMES: Record<string, Option[]> = {
  remote: [
    { value: "docker", label: "Docker" },
    { value: "k8s", label: "Kubernetes" },
  ],
  hetzner: [
    { value: "docker", label: "Docker" },
    { value: "k8s", label: "Kubernetes" },
  ],
  aws: [
    { value: "ecs", label: "AWS ECS" },
    { value: "k8s", label: "Kubernetes" },
  ],
  gcp: [{ value: "k8s", label: "Kubernetes" }],
};

async function promptConnection(
  runtime: string,
): Promise<ContextEntry["connection"]> {
  if (runtime === "docker") {
    const host = await text({
      message: "SSH host (e.g. user@192.168.1.10)",
      placeholder: "root@your-server-ip",
    });
    if (isCancel(host)) cancel();
    return { host };
  }
  if (runtime === "k8s") {
    const endpoint = await text({
      message: "Kubernetes API endpoint",
      placeholder: "https://k8s.example.com:6443",
    });
    if (isCancel(endpoint)) cancel();
    return { endpoint };
  }
  return undefined;
}

export default new Command("add")
  .alias("a")
  .description("Add a context")
  .argument("[name]", "Context name")
  .option("--platform <platform>", "Platform (e.g. remote, hetzner, aws, gcp)")
  .option("--runtime <runtime>", "Runtime (e.g. docker, ecs, k8s)")
  .action(
    async (
      nameArg: string | undefined,
      opts: { platform?: string; runtime?: string },
    ) => {
      const cwd = process.cwd();

      const name =
        nameArg ??
        (await (async () => {
          const answer = await text({
            message: "Context name",
            placeholder: "production",
          });
          if (isCancel(answer)) cancel();
          return answer;
        })());

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

      const runtimeOptions = RUNTIMES[platform] ?? [];
      const runtime =
        opts.runtime ??
        (await (async () => {
          if (runtimeOptions.length === 1) {
            return runtimeOptions[0]!.value;
          }
          if (runtimeOptions.length === 0) {
            cancel(`No known runtimes for platform "${platform}".`);
          }
          const answer = await select({
            message: "Runtime",
            options: runtimeOptions,
          });
          if (isCancel(answer)) cancel();
          return answer;
        })());

      const connection =
        platform === "remote" ? await promptConnection(runtime) : undefined;

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

      await addContext(cwd, name, { platform, runtime, connection });
      console.log(`Context "${name}" added.`);
    },
  );
