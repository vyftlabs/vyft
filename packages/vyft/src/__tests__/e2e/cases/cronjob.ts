import { cronjob } from "@vyft/platform";
import type { TestContext } from "../context.ts";

const tick = cronjob("tick", {
  image: "alpine:latest",
  schedule: "* * * * *",
  command: "echo tick",
});

export const config = { tick };

export async function check(t: TestContext) {
  t.resourceCount(1);
  t.resourceKind("tick", "cronjob");
  await t.cronjobReady("tick");
}
