import { bucket, postgres, service } from "vyft";

export const db = postgres("db");
export const uploads = bucket("uploads");

export const api = service("api", {
  build: { context: "../..", path: "examples/basic/src/api.ts" },
  dependsOn: [db, uploads],
  env: {
    DATABASE_URL: db.url,
    S3_ENDPOINT: uploads.endpoint,
    S3_BUCKET: uploads.name,
  },
  expose: 3000,
  port: 3000,
  dev: { command: "node --watch src/api.ts" },
});

export const worker = service("worker", {
  build: { context: "../..", path: "examples/basic/src/worker.ts" },
  dependsOn: [db],
  env: {
    DATABASE_URL: db.url,
  },
  dev: { command: "node --watch src/worker.ts" },
});
