import { resource, secret } from "@vyft/core";

/**
 * Example: define a custom composite resource.
 *
 * `resource()` creates a factory function that returns
 * a ResourceEntry (with config) or ResourceRef (without).
 */

// A database resource with a generated password
const database = resource(
  "database",
  (id, config: { name: string; engine: "postgres" | "mysql" }) => ({
    name: config.name,
    engine: config.engine,
    connectionString: secret(
      `${config.engine}://admin:s3cret@${id}.db.internal:5432/${config.name}`,
    ),
  }),
);

// A cache resource
const cache = resource("cache", (id, config: { maxMemoryMb: number }) => ({
  host: `${id}.cache.internal`,
  port: 6379,
  maxMemoryMb: config.maxMemoryMb,
}));

// A web service that composes a database and cache
const webService = resource(
  "web_service",
  (id, config: { name: string; replicas: number }) => ({
    name: config.name,
    replicas: config.replicas,
    image: `registry.internal/${config.name}:latest`,
    apiKey: secret(`key-${id}-${Date.now()}`),
  }),
);

// ── Usage with transform ────────────────────────────────────────────────

// import { transform } from "@vyft/core";
// const current = { entries: {} }; // from store
//
// const desired = transform(current)
//   .add(database("prod", { name: "myapp", engine: "postgres" }))
//   .add(cache("prod", { maxMemoryMb: 512 }))
//   .add(webService("prod", { name: "api", replicas: 3 }));
//
// // Update — only needs the ref (no config), prev is typed
// const updated = transform(current)
//   .update(webService("prod"), (prev) => ({ ...prev, replicas: 5 }));
//
// // Remove — only needs the ref
// const cleaned = transform(current)
//   .remove(database("staging"))
//   .remove(cache("staging"));

export { cache, database, webService };
