import { bucket, postgres, service } from "vyft";

export const db = postgres("db");
export const uploads = bucket("uploads");

export const api = service("api", {
  path: "examples/basic/src/api.ts",
  cwd: "../..",
  dependsOn: [db, uploads],
});

export const worker = service("worker", {
  path: "examples/basic/src/worker.ts",
  cwd: "../..",
  dependsOn: [db],
});
