import { bucket, postgres, service } from "vyft";

export const db = postgres("db");
export const uploads = bucket("uploads");

export const api = service("api", {
  build: { context: "../..", path: "examples/basic/src/api.ts" },
  dependsOn: [db, uploads],
  dev: { command: "node --watch src/api.ts" },
});

export const worker = service("worker", {
  build: { context: "../..", path: "examples/basic/src/worker.ts" },
  dependsOn: [db],
  dev: { command: "node --watch src/worker.ts" },
});
