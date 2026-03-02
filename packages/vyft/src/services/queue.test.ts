import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { service } from "@vyft/core";
import { queue } from "./queue.ts";

describe("queue()", () => {
  it("creates a service with default image", () => {
    const mq = queue("mq");
    strictEqual(mq.service.config.image, "rabbitmq:4-management");
  });

  it("creates a service on port 5672", () => {
    const mq = queue("mq");
    strictEqual(mq.service.port, 5672);
  });

  it("creates a volume for data", () => {
    const mq = queue("mq");
    strictEqual(mq.volume.id, "mq-data");
  });

  it("creates a secret for password", () => {
    const mq = queue("mq");
    strictEqual(mq.password.id, "mq-password");
    strictEqual(mq.password.kind, "config");
  });

  it("sets rabbitmq env vars", () => {
    const mq = queue("mq");
    strictEqual(mq.service.config.env?.["RABBITMQ_DEFAULT_USER"], "guest");
  });

  it("mounts volume at /var/lib/rabbitmq", () => {
    const mq = queue("mq");
    strictEqual(mq.service.config.mounts?.[0]?.path, "/var/lib/rabbitmq");
    strictEqual(mq.service.config.mounts?.[0]?.source.id, "mq-data");
  });

  it("configures health check", () => {
    const mq = queue("mq");
    strictEqual(
      mq.service.config.health?.command,
      "rabbitmq-diagnostics -q ping",
    );
    strictEqual(mq.service.config.health?.interval, "5s");
    strictEqual(mq.service.config.health?.retries, 5);
  });

  it("has bindable url, host, and port", () => {
    const mq = queue("mq");
    strictEqual(mq.url.kind, "binding");
    strictEqual(mq.host.kind, "binding");
    strictEqual(mq.host.value, "mq");
    strictEqual(mq.port.kind, "binding");
    strictEqual(mq.port.value, 5672);
  });

  it("accepts custom options", () => {
    const mq = queue("mq", { image: "rabbitmq:3", username: "admin" });
    strictEqual(mq.service.config.image, "rabbitmq:3");
    strictEqual(mq.service.config.env?.["RABBITMQ_DEFAULT_USER"], "admin");
  });

  it("produces correct env vars when linked", () => {
    const mq = queue("mq");
    const api = service("api", {
      build: "./apps/api",
      link: [mq],
    });
    strictEqual(typeof api.config.env?.["VYFT_BINDING_MQ_URL"], "object");
    strictEqual(api.config.env?.["VYFT_BINDING_MQ_HOST"], "mq");
    strictEqual(api.config.env?.["VYFT_BINDING_MQ_PORT"], "5672");
    strictEqual(api.config.dependsOn?.[0]?.id, "mq");
  });

  it("is a valid Linkable", () => {
    const mq = queue("mq");
    strictEqual(mq.id, "mq");
    strictEqual(mq.service.kind, "service");
  });
});
