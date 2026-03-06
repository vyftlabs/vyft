import { buildCaddyConfig, pushCaddyConfig } from "./caddy.ts";
import {
  buildContainerConfig,
  containerName,
  createContainer,
  removeContainer,
} from "./container.ts";
import type { DockerContext } from "./context.ts";
import { inspectContainer } from "./inspect.ts";
import { ensureNetwork } from "./network.ts";

const PROXY_ID = "proxy";
const CADDY_IMAGE = "caddy:2-alpine";

export async function ensureProxy(ctx: DockerContext): Promise<string> {
  const name = containerName(ctx.project, ctx.stage, PROXY_ID);
  const existing = await inspectContainer(ctx.client, name);
  if (existing) return existing.Id;

  await ensureNetwork(ctx.client, ctx.networkName);

  const config = buildContainerConfig(
    {
      image: CADDY_IMAGE,
      port: 80,
      restart: "always",
      env: {},
    },
    name,
    CADDY_IMAGE,
    ctx,
  );

  return createContainer(ctx.client, name, config);
}

export async function deployProxy(
  ctx: DockerContext,
  services: Array<{
    host: string;
    port: number;
    route?: string;
    domain?: string;
  }>,
): Promise<void> {
  const name = containerName(ctx.project, ctx.stage, PROXY_ID);
  await ensureProxy(ctx);
  const caddyConfig = buildCaddyConfig(services);
  await pushCaddyConfig(ctx.client, name, caddyConfig);
}

export async function removeProxy(ctx: DockerContext): Promise<void> {
  const name = containerName(ctx.project, ctx.stage, PROXY_ID);
  await removeContainer(ctx.client, name);
}
