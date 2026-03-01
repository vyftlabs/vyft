import type { K8sClient } from "./client.ts";

/** Ensure the project namespace exists. */
export async function ensureNamespace(
  client: K8sClient,
  name: string,
): Promise<void> {
  try {
    await client.readNamespace({ name });
  } catch (err: unknown) {
    if (isNotFound(err)) {
      try {
        await client.createNamespace({
          body: {
            metadata: {
              name,
              labels: { "app.kubernetes.io/managed-by": "vyft" },
            },
          },
        });
      } catch (createErr: unknown) {
        // 409 = already exists (race or still terminating) — that's fine
        if (!isConflict(createErr)) throw createErr;
      }
      return;
    }
    throw err;
  }
}

/** Delete a namespace — cascades all resources. */
export async function deleteNamespace(
  client: K8sClient,
  name: string,
): Promise<void> {
  try {
    await client.deleteNamespace({ name });
  } catch (err: unknown) {
    if (!isNotFound(err)) throw err;
  }
}

function hasStatusCode(err: unknown, code: number): boolean {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (e["statusCode"] === code || e["code"] === code) return true;
    if (typeof e["response"] === "object" && e["response"] !== null) {
      const resp = e["response"] as Record<string, unknown>;
      if (resp["statusCode"] === code) return true;
    }
  }
  return false;
}

function isNotFound(err: unknown): boolean {
  return hasStatusCode(err, 404);
}

function isConflict(err: unknown): boolean {
  return hasStatusCode(err, 409);
}
