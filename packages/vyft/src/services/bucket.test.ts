import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { service } from "@vyft/core";
import { bucket } from "./bucket.ts";

// Reset the shared singleton between tests by re-importing won't work,
// but since the singleton is deterministic, tests are stable regardless.

describe("bucket()", () => {
  it("is a valid Linkable with correct id", () => {
    const uploads = bucket("uploads");
    strictEqual(uploads.id, "uploads");
    strictEqual(uploads.service.kind, "service");
  });

  it("has bindable url, name, host, and port", () => {
    const uploads = bucket("uploads");
    strictEqual(uploads.url.kind, "binding");
    strictEqual(uploads.url.value, "http://storage:9000");
    strictEqual(uploads.name.kind, "binding");
    strictEqual(uploads.name.value, "uploads");
    strictEqual(uploads.host.kind, "binding");
    strictEqual(uploads.host.value, "storage");
    strictEqual(uploads.port.kind, "binding");
    strictEqual(uploads.port.value, 9000);
  });

  it("multiple buckets share the same underlying service", () => {
    const uploads = bucket("uploads");
    const assets = bucket("assets");
    strictEqual(uploads.service, assets.service);
    strictEqual(uploads.service.id, "storage");
  });

  it("each bucket has its own name", () => {
    const uploads = bucket("uploads");
    const assets = bucket("assets");
    strictEqual(uploads.name.value, "uploads");
    strictEqual(assets.name.value, "assets");
    strictEqual(uploads.id, "uploads");
    strictEqual(assets.id, "assets");
  });

  it("access and secret bindings reference shared Config secrets", () => {
    const uploads = bucket("uploads");
    strictEqual(uploads.access.kind, "binding");
    const accessRef = uploads.access.value as { kind: string; id: string };
    strictEqual(accessRef.kind, "config");
    strictEqual(accessRef.id, "storage-access-key");
    strictEqual(uploads.secret.kind, "binding");
    const secretRef = uploads.secret.value as { kind: string; id: string };
    strictEqual(secretRef.kind, "config");
    strictEqual(secretRef.id, "storage-secret-key");
  });

  it("shared service has correct MinIO configuration", () => {
    const uploads = bucket("uploads");
    const svc = uploads.service;
    strictEqual(svc.config.image, "minio/minio");
    strictEqual(svc.port, 9000);
    strictEqual(svc.config.command, "server /data --console-address :9001");
    strictEqual(svc.config.mounts?.[0]?.path, "/data");
    strictEqual(
      svc.config.health?.command,
      "curl -f http://localhost:9000/minio/health/live",
    );
    strictEqual(svc.config.health?.interval, "5s");
    strictEqual(svc.config.health?.retries, 5);
  });

  it("produces correct env vars when linked", () => {
    const uploads = bucket("uploads");
    const api = service("api", {
      build: "./apps/api",
      link: [uploads],
    });
    strictEqual(api.config.env?.["UPLOADS_URL"], "http://storage:9000");
    strictEqual(api.config.env?.["UPLOADS_NAME"], "uploads");
    strictEqual(api.config.env?.["UPLOADS_HOST"], "storage");
    strictEqual(api.config.env?.["UPLOADS_PORT"], "9000");
    // access and secret are Config references, passed through as-is
    const accessEnv = api.config.env?.["UPLOADS_ACCESS"] as {
      kind: string;
      id: string;
    };
    strictEqual(accessEnv.kind, "config");
    strictEqual(accessEnv.id, "storage-access-key");
    const secretEnv = api.config.env?.["UPLOADS_SECRET"] as {
      kind: string;
      id: string;
    };
    strictEqual(secretEnv.kind, "config");
    strictEqual(secretEnv.id, "storage-secret-key");
    strictEqual(api.config.dependsOn?.[0]?.id, "storage");
  });

  it("multiple buckets linked produce separate env var prefixes", () => {
    const uploads = bucket("uploads");
    const assets = bucket("assets");
    const api = service("worker", {
      build: "./apps/worker",
      link: [uploads, assets],
    });
    strictEqual(api.config.env?.["UPLOADS_URL"], "http://storage:9000");
    strictEqual(api.config.env?.["UPLOADS_NAME"], "uploads");
    strictEqual(api.config.env?.["ASSETS_URL"], "http://storage:9000");
    strictEqual(api.config.env?.["ASSETS_NAME"], "assets");
  });
});
