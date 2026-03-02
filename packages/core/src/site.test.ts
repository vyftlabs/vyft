import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { service, site } from "./primitives.ts";

describe("site()", () => {
  it("creates a service with nginx:alpine image", () => {
    const web = site("web", { path: "./apps/web" });
    strictEqual(web.service.config.image, "nginx:alpine");
  });

  it("creates a service on port 80", () => {
    const web = site("web", { path: "./apps/web" });
    strictEqual(web.service.port, 80);
  });

  it("configures health check", () => {
    const web = site("web", { path: "./apps/web" });
    strictEqual(
      web.service.config.health?.command,
      "curl -f http://localhost/ || exit 1",
    );
    strictEqual(web.service.config.health?.interval, "5s");
    strictEqual(web.service.config.health?.retries, 3);
  });

  it("maps domain to route", () => {
    const web = site("web", { path: "./apps/web", domain: "example.com" });
    strictEqual(web.service.config.route, "example.com");
  });

  it("omits route when no domain", () => {
    const web = site("web", { path: "./apps/web" });
    strictEqual(web.service.config.route, undefined);
  });

  it("stores path from options", () => {
    const web = site("web", { path: "./apps/web" });
    strictEqual(web.path, "./apps/web");
  });

  it("defaults buildCommand to npm run build", () => {
    const web = site("web", { path: "./apps/web" });
    strictEqual(web.buildCommand, "npm run build");
  });

  it("defaults outDir to dist", () => {
    const web = site("web", { path: "./apps/web" });
    strictEqual(web.outDir, "dist");
  });

  it("defaults spa to true", () => {
    const web = site("web", { path: "./apps/web" });
    strictEqual(web.spa, true);
  });

  it("accepts custom build options", () => {
    const web = site("web", {
      path: "./apps/web",
      buildCommand: "pnpm build",
      outDir: "build",
      spa: false,
    });
    strictEqual(web.buildCommand, "pnpm build");
    strictEqual(web.outDir, "build");
    strictEqual(web.spa, false);
  });

  it("has bindable url, host, and port", () => {
    const web = site("web", { path: "./apps/web" });
    strictEqual(web.url.kind, "binding");
    strictEqual(web.url.value, "http://web:80");
    strictEqual(web.host.kind, "binding");
    strictEqual(web.host.value, "web");
    strictEqual(web.port.kind, "binding");
    strictEqual(web.port.value, 80);
  });

  it("is a valid Linkable", () => {
    const web = site("web", { path: "./apps/web" });
    strictEqual(web.id, "web");
    strictEqual(web.service.kind, "service");
  });

  it("produces correct env vars when linked", () => {
    const web = site("web", { path: "./apps/web" });
    const api = service("api", {
      build: "./apps/api",
      link: [web],
    });
    strictEqual(api.config.env?.["VYFT_BINDING_WEB_URL"], "http://web:80");
    strictEqual(api.config.env?.["VYFT_BINDING_WEB_HOST"], "web");
    strictEqual(api.config.env?.["VYFT_BINDING_WEB_PORT"], "80");
    strictEqual(api.config.dependsOn?.[0]?.id, "web");
  });
});
