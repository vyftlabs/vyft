import { service, volume } from "@vyft/core";
import type { TestContext } from "../context.ts";

const data = volume("data");

export const config = {
  data,
  app: service("app", {
    image: "alpine:latest",
    command: ["sh", "-c", "touch /data/ready && sleep 3600"],
    mounts: [{ volume: data, path: "/data" }],
    health: { command: "test -f /data/ready", interval: "2s", retries: 3 },
  }),
};

export async function check(t: TestContext) {
  t.resourceCount(2);
  t.resourceKind("data", "volume");
  await t.serviceReady("app");
}
