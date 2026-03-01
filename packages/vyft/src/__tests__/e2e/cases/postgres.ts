import { secret, service, volume } from "@vyft/core";
import type { TestContext } from "../context.ts";

const data = volume("data");
const password = secret("password");

export const config = {
  data,
  password,
  postgres: service("postgres", {
    image: "postgres:17",
    port: 5432,
    mounts: [{ source: data, path: "/var/lib/postgresql/data" }],
    env: {
      POSTGRES_DB: "postgres",
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: password,
    },
    health: { command: "pg_isready -U postgres", interval: "3s", retries: 5 },
  }),
};

export async function check(t: TestContext) {
  t.resourceCount(3);
  t.serviceOutputs("postgres", { host: "postgres", port: 5432 });
  await t.serviceReady("postgres");
}
