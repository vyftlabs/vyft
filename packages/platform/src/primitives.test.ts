import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Linkable } from "@vyft/core";
import { bindable, cronjob, isSecretOutput, secret, service } from "./index.ts";

describe("secret()", () => {
  it("creates a SecretOutput with kind and value", () => {
    const s = secret("abc123");
    deepStrictEqual(s, { kind: "secret", value: "abc123" });
  });

  it("isSecretOutput returns true for secret values", () => {
    strictEqual(isSecretOutput(secret("x")), true);
  });

  it("isSecretOutput returns false for plain strings", () => {
    strictEqual(isSecretOutput("abc"), false);
  });

  it("isSecretOutput returns false for null/undefined", () => {
    strictEqual(isSecretOutput(null), false);
    strictEqual(isSecretOutput(undefined), false);
  });

  it("isSecretOutput returns false for objects with different kind", () => {
    strictEqual(isSecretOutput({ kind: "binding", value: "x" }), false);
  });

  it("isSecretOutput returns false for objects without kind", () => {
    strictEqual(isSecretOutput({ value: "x" }), false);
  });
});

describe("service() link expansion", () => {
  it("expands link bindings into env vars", () => {
    const dbSvc = service("db", { image: "postgres:17", port: 5432 });
    const linkItem: Linkable = {
      id: "db",
      service: dbSvc,
      url: bindable("postgres://db:5432"),
      host: bindable("db"),
      port: bindable(5432),
    };

    const api = service("api", {
      build: "./apps/api",
      link: [linkItem],
    });

    strictEqual(api.config.env?.["VYFT_BINDING_DB_URL"], "postgres://db:5432");
    strictEqual(api.config.env?.["VYFT_BINDING_DB_HOST"], "db");
    strictEqual(api.config.env?.["VYFT_BINDING_DB_PORT"], "5432");
  });

  it("adds linked services to dependsOn", () => {
    const dbSvc = service("db", { image: "postgres:17", port: 5432 });
    const linkItem: Linkable = {
      id: "db",
      service: dbSvc,
      host: bindable("db"),
    };

    const api = service("api", {
      build: "./apps/api",
      link: [linkItem],
    });

    strictEqual(api.config.dependsOn?.length, 1);
    strictEqual(api.config.dependsOn?.[0]?.id, "db");
  });

  it("merges link env with explicit env (explicit wins)", () => {
    const dbSvc = service("db", { image: "postgres:17", port: 5432 });
    const linkItem: Linkable = {
      id: "db",
      service: dbSvc,
      host: bindable("db"),
    };

    const api = service("api", {
      build: "./apps/api",
      link: [linkItem],
      env: { VYFT_BINDING_DB_HOST: "custom-host" },
    });

    strictEqual(api.config.env?.["VYFT_BINDING_DB_HOST"], "custom-host");
  });

  it("merges link dependsOn with explicit dependsOn", () => {
    const dbSvc = service("db", { image: "postgres:17", port: 5432 });
    const redisSvc = service("redis", { image: "redis:7", port: 6379 });
    const linkItem: Linkable = {
      id: "db",
      service: dbSvc,
      host: bindable("db"),
    };

    const api = service("api", {
      build: "./apps/api",
      link: [linkItem],
      dependsOn: [redisSvc],
    });

    strictEqual(api.config.dependsOn?.length, 2);
    strictEqual(api.config.dependsOn?.[0]?.id, "db");
    strictEqual(api.config.dependsOn?.[1]?.id, "redis");
  });

  it("converts hyphenated ids to underscored env prefix", () => {
    const dbSvc = service("my-db", { image: "postgres:17", port: 5432 });
    const linkItem: Linkable = {
      id: "my-db",
      service: dbSvc,
      url: bindable("postgres://my-db:5432"),
    };

    const api = service("api", {
      build: "./apps/api",
      link: [linkItem],
    });

    strictEqual(
      api.config.env?.["VYFT_BINDING_MY_DB_URL"],
      "postgres://my-db:5432",
    );
  });

  it("skips non-binding properties", () => {
    const dbSvc = service("db", { image: "postgres:17", port: 5432 });
    const linkItem: Linkable = {
      id: "db",
      service: dbSvc,
      host: bindable("db"),
      notABinding: "plain-string",
    };

    const api = service("api", {
      build: "./apps/api",
      link: [linkItem],
    });

    strictEqual(api.config.env?.["VYFT_BINDING_DB_HOST"], "db");
    strictEqual("VYFT_BINDING_DB_NOTABINDING" in (api.config.env ?? {}), false);
  });

  it("handles multiple link items", () => {
    const dbSvc = service("db", { image: "postgres:17", port: 5432 });
    const cacheSvc = service("cache", { image: "redis:7", port: 6379 });
    const dbLink: Linkable = {
      id: "db",
      service: dbSvc,
      host: bindable("db"),
    };
    const cacheLink: Linkable = {
      id: "cache",
      service: cacheSvc,
      host: bindable("cache"),
    };

    const api = service("api", {
      build: "./apps/api",
      link: [dbLink, cacheLink],
    });

    strictEqual(api.config.env?.["VYFT_BINDING_DB_HOST"], "db");
    strictEqual(api.config.env?.["VYFT_BINDING_CACHE_HOST"], "cache");
    strictEqual(api.config.dependsOn?.length, 2);
  });

  it("does not include link on the final config", () => {
    const dbSvc = service("db", { image: "postgres:17", port: 5432 });
    const linkItem: Linkable = {
      id: "db",
      service: dbSvc,
      host: bindable("db"),
    };

    const api = service("api", {
      build: "./apps/api",
      link: [linkItem],
    });

    strictEqual("link" in api.config, false);
  });

  it("works without link field", () => {
    const api = service("api", { build: "./apps/api" });
    strictEqual(api.id, "api");
    deepStrictEqual(api.config.env, { PORT: "3000", NODE_ENV: "production" });
  });
});

describe("cronjob() link expansion", () => {
  it("expands link bindings into env vars", () => {
    const dbSvc = service("db", { image: "postgres:17", port: 5432 });
    const linkItem: Linkable = {
      id: "db",
      service: dbSvc,
      url: bindable("postgres://db:5432"),
      host: bindable("db"),
      port: bindable(5432),
    };

    const job = cronjob("migrate", {
      image: "alpine",
      schedule: "0 3 * * *",
      link: [linkItem],
    });

    strictEqual(job.config.env?.["VYFT_BINDING_DB_URL"], "postgres://db:5432");
    strictEqual(job.config.env?.["VYFT_BINDING_DB_HOST"], "db");
    strictEqual(job.config.env?.["VYFT_BINDING_DB_PORT"], "5432");
  });

  it("merges link env with explicit env (explicit wins)", () => {
    const dbSvc = service("db", { image: "postgres:17", port: 5432 });
    const linkItem: Linkable = {
      id: "db",
      service: dbSvc,
      host: bindable("db"),
    };

    const job = cronjob("migrate", {
      image: "alpine",
      schedule: "0 3 * * *",
      link: [linkItem],
      env: { VYFT_BINDING_DB_HOST: "custom-host" },
    });

    strictEqual(job.config.env?.["VYFT_BINDING_DB_HOST"], "custom-host");
  });

  it("does not include link on the final config", () => {
    const dbSvc = service("db", { image: "postgres:17", port: 5432 });
    const linkItem: Linkable = {
      id: "db",
      service: dbSvc,
      host: bindable("db"),
    };

    const job = cronjob("migrate", {
      image: "alpine",
      schedule: "0 3 * * *",
      link: [linkItem],
    });

    strictEqual("link" in job.config, false);
  });

  it("works without link field", () => {
    const job = cronjob("cleanup", {
      image: "alpine",
      schedule: "0 3 * * *",
    });
    strictEqual(job.id, "cleanup");
    strictEqual(job.config.env, undefined);
  });
});
