import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { service } from "@vyft/core";
import { postgres } from "./postgres.ts";

describe("postgres()", () => {
  it("creates a service with default image", () => {
    const db = postgres("db");
    strictEqual(db.service.config.image, "postgres:17");
  });

  it("creates a service on port 5432", () => {
    const db = postgres("db");
    strictEqual(db.service.port, 5432);
  });

  it("creates a volume for data", () => {
    const db = postgres("db");
    strictEqual(db.volume.id, "db-data");
    strictEqual(db.volume.kind, "volume");
  });

  it("creates a secret for password", () => {
    const db = postgres("db");
    strictEqual(db.password.id, "db-password");
    strictEqual(db.password.kind, "config");
  });

  it("sets postgres env vars", () => {
    const db = postgres("db");
    strictEqual(db.service.config.env?.["POSTGRES_DB"], "postgres");
    strictEqual(db.service.config.env?.["POSTGRES_USER"], "postgres");
  });

  it("mounts volume at /var/lib/postgresql/data", () => {
    const db = postgres("db");
    strictEqual(
      db.service.config.mounts?.[0]?.path,
      "/var/lib/postgresql/data",
    );
    strictEqual(db.service.config.mounts?.[0]?.source.id, "db-data");
  });

  it("configures health check", () => {
    const db = postgres("db");
    strictEqual(db.service.config.health?.command, "pg_isready -U postgres");
    strictEqual(db.service.config.health?.interval, "5s");
    strictEqual(db.service.config.health?.retries, 5);
  });

  it("has bindable url, host, and port", () => {
    const db = postgres("db");
    strictEqual(db.url.kind, "binding");
    strictEqual(db.host.kind, "binding");
    strictEqual(db.host.value, "db");
    strictEqual(db.port.kind, "binding");
    strictEqual(db.port.value, 5432);
  });

  it("accepts custom options", () => {
    const db = postgres("db", {
      image: "postgres:16",
      database: "mydb",
      username: "admin",
    });
    strictEqual(db.service.config.image, "postgres:16");
    strictEqual(db.service.config.env?.["POSTGRES_DB"], "mydb");
    strictEqual(db.service.config.env?.["POSTGRES_USER"], "admin");
    strictEqual(db.service.config.health?.command, "pg_isready -U admin");
  });

  it("produces correct env vars when linked", () => {
    const db = postgres("db");
    const api = service("api", {
      build: "./apps/api",
      link: [db],
    });
    strictEqual(typeof api.config.env?.["DB_URL"], "object");
    strictEqual(api.config.env?.["DB_HOST"], "db");
    strictEqual(api.config.env?.["DB_PORT"], "5432");
    strictEqual(api.config.dependsOn?.[0]?.id, "db");
  });

  it("is a valid Linkable", () => {
    const db = postgres("db");
    strictEqual(db.id, "db");
    strictEqual(db.service.kind, "service");
  });
});
