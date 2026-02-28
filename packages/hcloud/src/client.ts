import client from "openapi-fetch";
import type { paths } from "./schema.d.ts";

export function createClient(token: string) {
  return client<paths>({
    baseUrl: "https://api.hetzner.cloud/v1",
    headers: { Authorization: `Bearer ${token}` },
  });
}
