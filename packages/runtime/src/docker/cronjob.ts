import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BindMount, CronJobConfig, EnvValue } from "@vyft/core";
import { buildImage, durationToNanos, resolveEnv } from "@vyft/core";
import type { DockerClient } from "./client.ts";
import type { ContainerConfig } from "./service.ts";
import { removeContainer } from "./service.ts";

const SUPERCRONIC_VERSION = "v0.2.43";
const SUPERCRONIC_URL = `https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}`;

function exec(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Build a wrapper image that injects supercronic into the user's base image.
 * The resulting container runs supercronic as PID 1, firing the job command on schedule.
 */
export async function buildCronImage(
  tag: string,
  baseImage: string,
  schedule: string,
  command: string | string[],
): Promise<void> {
  const cmd = Array.isArray(command) ? command.join(" ") : command;
  const crontab = `${schedule} ${cmd}\n`;

  const dir = await mkdtemp(join(tmpdir(), "vyft-cron-"));
  try {
    // Download the correct supercronic binary for the target platform via ADD.
    // Docker resolves TARGETARCH at build time (amd64, arm64, etc.).
    const dockerfile = [
      `FROM ${baseImage}`,
      `ARG TARGETARCH`,
      `ADD ${SUPERCRONIC_URL}/supercronic-linux-\${TARGETARCH} /usr/local/bin/supercronic`,
      `RUN chmod +x /usr/local/bin/supercronic`,
      `COPY crontab /etc/vyft-crontab`,
      `ENTRYPOINT ["supercronic", "/etc/vyft-crontab"]`,
    ].join("\n");

    await writeFile(join(dir, "Dockerfile"), dockerfile);
    await writeFile(join(dir, "crontab"), crontab);
    await exec("docker", ["build", "-t", tag, dir]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Build a Docker container config for a cronjob scheduler container. */
export function buildCronContainerConfig(
  id: string,
  cronImage: string,
  config: CronJobConfig,
  networkName: string,
  secrets: ReadonlyMap<string, string>,
  project?: string,
): ContainerConfig {
  const env = config.env
    ? resolveEnv(config.env as Record<string, EnvValue>, secrets)
    : {};
  const envArr = Object.entries(env).map(([k, v]) => `${k}=${v}`);

  const binds: string[] = [];
  if (config.mounts) {
    for (const m of config.mounts) {
      if (m.source.kind === "bind") {
        binds.push(`${(m.source as BindMount).hostPath}:${m.path}`);
      } else {
        const src = project ? `vyft-${project}-${m.source.id}` : m.source.id;
        binds.push(`${src}:${m.path}`);
      }
    }
  }

  const composeProject = project ? `vyft-${project}` : id;

  return {
    Image: cronImage,
    Env: envArr,
    Labels: {
      "com.docker.compose.project": composeProject,
      "com.docker.compose.service": id,
      "com.docker.compose.container-number": "1",
      "com.docker.compose.oneoff": "False",
    },
    HostConfig: {
      Binds: binds,
      NetworkMode: networkName,
      // The scheduler container must stay alive — always restart it
      RestartPolicy: { Name: "always", MaximumRetryCount: 0 },
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [networkName]: { Aliases: [id] },
      },
    },
  };
}

/** Create and start a cronjob scheduler container. */
export async function createCronContainer(
  client: DockerClient,
  containerName: string,
  id: string,
  config: CronJobConfig,
  networkName: string,
  secrets: ReadonlyMap<string, string>,
  project?: string,
): Promise<string> {
  // Build the user's image if build config is present
  let baseImage = config.image ?? `vyft-build-${id}:latest`;
  if (config.build) {
    baseImage = `vyft-build-${id}:latest`;
    await buildImage(baseImage, config.build);
  }

  // Build the wrapper image with supercronic
  const cronTag = `vyft-cron-${id}:latest`;
  await buildCronImage(
    cronTag,
    baseImage,
    config.schedule,
    config.command ?? "true",
  );

  const cc = buildCronContainerConfig(
    id,
    cronTag,
    config,
    networkName,
    secrets,
    project,
  );

  if (config.health) {
    const hc: Record<string, unknown> = {
      Test: ["CMD-SHELL", config.health.command],
    };
    if (config.health.interval)
      hc["Interval"] = durationToNanos(config.health.interval);
    if (config.health.timeout)
      hc["Timeout"] = durationToNanos(config.health.timeout);
    if (config.health.retries !== undefined)
      hc["Retries"] = config.health.retries;
    if (config.health.startPeriod)
      hc["StartPeriod"] = durationToNanos(config.health.startPeriod);
    cc.Healthcheck = hc;
  }

  const result = (await client.post(
    `/containers/create?name=${encodeURIComponent(containerName)}`,
    cc,
  )) as { Id: string };

  await client.post(`/containers/${result.Id}/start`);
  return result.Id;
}

/** Recreate a cronjob scheduler container. */
export async function recreateCronContainer(
  client: DockerClient,
  containerName: string,
  id: string,
  config: CronJobConfig,
  networkName: string,
  secrets: ReadonlyMap<string, string>,
  project?: string,
): Promise<string> {
  await removeContainer(client, containerName);
  return createCronContainer(
    client,
    containerName,
    id,
    config,
    networkName,
    secrets,
    project,
  );
}
