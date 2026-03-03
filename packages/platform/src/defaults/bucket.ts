/**
 * Default bucket implementation using MinIO (S3-compatible).
 * Used when the platform doesn't provide native object storage (e.g., S3).
 */

import { INTERNAL } from "@vyft/core";
import { job, resource, service, volume } from "../index.ts";

export interface BucketOptions {
  /** Volume size for storage (default: "10Gi") */
  size?: string;
}

export interface BucketResult {
  /** S3-compatible endpoint URL */
  endpoint: string;
  /** Bucket name */
  name: string;
}

/**
 * Create an S3-compatible bucket using a shared MinIO instance.
 *
 * Multiple buckets share the same MinIO service (deduped via explicit namespace).
 * An init job creates the bucket before dependent services start.
 * A cleanup job removes the bucket on destroy.
 *
 * @example
 * ```ts
 * const uploads = bucket("uploads");
 * const assets = bucket("assets");
 *
 * const api = service("api", {
 *   dependsOn: [uploads, assets], // wait for buckets to be created
 *   env: {
 *     S3_ENDPOINT: uploads.endpoint,
 *     UPLOADS_BUCKET: uploads.name,
 *     ASSETS_BUCKET: assets.name,
 *   },
 * });
 * ```
 */
export const bucket = resource("bucket", (id, opts?: BucketOptions) => {
  const size = opts?.size ?? "10Gi";

  // Shared MinIO service - deduped across multiple bucket() calls
  // Lives in "vyft" namespace, never auto-destroyed
  const data = volume("minio-data", { size }, { namespace: "vyft" });

  const svc = service(
    "minio",
    {
      image: "minio/minio:latest",
      port: 9000,
      command: ["server", "/data", "--console-address", ":9001"],
      mounts: [{ source: data, path: "/data" }],
    },
    { namespace: "vyft" },
  );

  // Init job creates the bucket - runs on create
  const init = job("init", {
    image: "minio/mc:latest",
    command: [
      "sh",
      "-c",
      `mc alias set minio http://${svc.host}:9000 minioadmin minioadmin && mc mb --ignore-existing minio/${id}`,
    ],
    dependsOn: [svc],
  });

  return {
    outputs: {
      endpoint: `http://${svc.host}:9000`,
      name: id,
    },
    ready: init[INTERNAL].ready,
    beforeDelete: () => {
      // Cleanup job removes the bucket before deletion
      job("cleanup", {
        image: "minio/mc:latest",
        command: [
          "sh",
          "-c",
          `mc alias set minio http://${svc.host}:9000 minioadmin minioadmin && mc rb --force minio/${id}`,
        ],
        dependsOn: [svc],
      });
    },
  };
});
