import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { generateCaddyConfig } from "../../../../src/runtimes/docker/caddy.ts";

describe("generateCaddyConfig", () => {
  it("generates config with single route", () => {
    const config = generateCaddyConfig([
      { match: "api.example.com", upstream: "api:3000" },
    ]);

    const servers = (config.apps as Record<string, unknown>).http as Record<
      string,
      unknown
    >;
    const srv0 = (servers.servers as Record<string, unknown>).srv0 as Record<
      string,
      unknown
    >;

    ok(srv0);
    deepStrictEqual(srv0.listen, [":80", ":443"]);

    const routes = srv0.routes as Record<string, unknown>[];
    strictEqual(routes.length, 1);

    const route = routes[0];
    ok(route, "route should exist");
    const matchers = route.match as Record<string, unknown>[];
    deepStrictEqual(matchers[0]?.host, ["api.example.com"]);

    const handlers = route.handle as Record<string, unknown>[];
    strictEqual(handlers[0]?.handler, "reverse_proxy");
    deepStrictEqual(
      (handlers[0]?.upstreams as Record<string, unknown>[])[0]?.dial,
      "api:3000",
    );
  });

  it("handles route with path", () => {
    const config = generateCaddyConfig([
      { match: "api.example.com/v1", upstream: "api:3000" },
    ]);

    const servers = (config.apps as Record<string, unknown>).http as Record<
      string,
      unknown
    >;
    const srv0 = (servers.servers as Record<string, unknown>).srv0 as Record<
      string,
      unknown
    >;
    const routes = srv0.routes as Record<string, unknown>[];
    const matchers = routes[0]?.match as Record<string, unknown>[];

    deepStrictEqual(matchers[0]?.host, ["api.example.com"]);
    deepStrictEqual(matchers[0]?.path, ["/v1*"]);
  });

  it("handles multiple routes", () => {
    const config = generateCaddyConfig([
      { match: "api.example.com", upstream: "api:3000" },
      { match: "web.example.com", upstream: "web:8080" },
    ]);

    const servers = (config.apps as Record<string, unknown>).http as Record<
      string,
      unknown
    >;
    const srv0 = (servers.servers as Record<string, unknown>).srv0 as Record<
      string,
      unknown
    >;
    const routes = srv0.routes as Record<string, unknown>[];

    strictEqual(routes.length, 2);
  });

  it("generates empty routes array for no routes", () => {
    const config = generateCaddyConfig([]);

    const servers = (config.apps as Record<string, unknown>).http as Record<
      string,
      unknown
    >;
    const srv0 = (servers.servers as Record<string, unknown>).srv0 as Record<
      string,
      unknown
    >;
    const routes = srv0.routes as Record<string, unknown>[];

    strictEqual(routes.length, 0);
  });
});
