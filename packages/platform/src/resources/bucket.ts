import { defineResource } from "@vyft/provider";

export interface BucketArgs {
  acl?: "private" | "public-read";
}

export const bucketResource = defineResource<BucketArgs>("bucket", {});
