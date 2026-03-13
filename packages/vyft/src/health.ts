import { type createClient, inspectContainer } from "@vyft/docker";

interface HealthContainer {
  name: string;
  urn: string;
}

export async function waitForHealthy(
  client: ReturnType<typeof createClient>,
  containers: HealthContainer[],
  onStatus?: (
    urn: string,
    status: "starting" | "healthy" | "unhealthy",
  ) => void,
): Promise<void> {
  const timeoutMs = 60_000;
  const start = Date.now();
  const pending = new Map<string, string>();
  for (const c of containers) {
    pending.set(c.name, c.urn);
  }

  for (const c of containers) {
    onStatus?.(c.urn, "starting");
  }

  while (pending.size > 0) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Timed out waiting for containers: ${[...pending.keys()].join(", ")}`,
      );
    }
    for (const [name, urnValue] of pending) {
      const info = await inspectContainer(client, name);
      const status = info?.State.Health?.Status;
      if (status === "healthy") {
        onStatus?.(urnValue, "healthy");
        pending.delete(name);
      } else if (status === "unhealthy") {
        onStatus?.(urnValue, "unhealthy");
        throw new Error(`Container ${name} is unhealthy`);
      }
    }
    if (pending.size > 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
