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
    strictEqual(uploads.url.value, "http://storage:3900");
    strictEqual(uploads.name.kind, "binding");
    strictEqual(uploads.name.value, "uploads");
    strictEqual(uploads.host.kind, "binding");
    strictEqual(uploads.host.value, "storage");
    strictEqual(uploads.port.kind, "binding");
    strictEqual(uploads.port.value, 3900);
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

  it("shared service has correct Garage configuration", () => {
    const uploads = bucket("uploads");
    const svc = uploads.service;
    strictEqual(svc.config.image, "dxflrs/garage:v1.1.0");
    strictEqual(svc.port, 3900);
    strictEqual(svc.config.mounts?.[0]?.path, "/var/lib/garage");
    strictEqual(
      svc.config.health?.command,
      "curl -f http://localhost:3900/health || exit 1",
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
    strictEqual(
      api.config.env?.["VYFT_BINDING_UPLOADS_URL"],
      "http://storage:3900",
    );
    strictEqual(api.config.env?.["VYFT_BINDING_UPLOADS_NAME"], "uploads");
    strictEqual(api.config.env?.["VYFT_BINDING_UPLOADS_HOST"], "storage");
    strictEqual(api.config.env?.["VYFT_BINDING_UPLOADS_PORT"], "3900");
    // access and secret are Config references, passed through as-is
    const accessEnv = api.config.env?.["VYFT_BINDING_UPLOADS_ACCESS"] as {
      kind: string;
      id: string;
    };
    strictEqual(accessEnv.kind, "config");
    strictEqual(accessEnv.id, "storage-access-key");
    const secretEnv = api.config.env?.["VYFT_BINDING_UPLOADS_SECRET"] as {
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
    strictEqual(
      api.config.env?.["VYFT_BINDING_UPLOADS_URL"],
      "http://storage:3900",
    );
    strictEqual(api.config.env?.["VYFT_BINDING_UPLOADS_NAME"], "uploads");
    strictEqual(
      api.config.env?.["VYFT_BINDING_ASSETS_URL"],
      "http://storage:3900",
    );
    strictEqual(api.config.env?.["VYFT_BINDING_ASSETS_NAME"], "assets");
  });
});
