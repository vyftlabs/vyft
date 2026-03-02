import { service } from "vyft";
import { postgres, redis } from "vyft/services";

export const db = postgres("db");
export const cache = redis("redis");

export const api = service("api", {
  build: { context: "../..", path: "examples/basic/src/api.ts" },
  link: [db, cache],
  expose: 3000,
  port: 3000,
  dev: { command: "node --watch src/api.ts" },
});

export const worker = service("worker", {
  build: { context: "../..", path: "examples/basic/src/worker.ts" },
  link: [db, cache],
  dev: { command: "node --watch src/worker.ts" },
});
