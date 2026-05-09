import createClient, { type Middleware } from "openapi-fetch";
import { ApiError } from "./errors";
import type { paths } from "./schema.gen";

// Throw ApiError on non-2xx responses so react-query treats them as failures.
const throwOnError: Middleware = {
  async onResponse({ response }) {
    if (response.ok) return;
    let code: ApiError["code"] = "INTERNAL";
    let message = response.statusText || `HTTP ${response.status}`;
    try {
      const body = (await response.clone().json()) as {
        code?: ApiError["code"];
        message?: string;
      };
      if (body.code) code = body.code;
      if (body.message) message = body.message;
    } catch {
      // not JSON; keep statusText
    }
    throw new ApiError(code, message);
  },
};

export const client = createClient<paths>({ baseUrl: "/api" });
client.use(throwOnError);
