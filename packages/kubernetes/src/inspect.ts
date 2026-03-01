interface K8sDeployment {
  spec?: {
    replicas?: number;
    template?: {
      spec?: {
        containers?: {
          image?: string;
          env?: { name: string; value?: string }[];
          command?: string[];
          livenessProbe?: {
            exec?: { command?: string[] };
            periodSeconds?: number;
            timeoutSeconds?: number;
            failureThreshold?: number;
            initialDelaySeconds?: number;
          };
          volumeMounts?: { name: string; mountPath: string }[];
        }[];
      };
    };
  };
}

/** Normalize a K8s Deployment response into vyft ServiceConfig-like shape. */
export function normalizeK8sDeployment(info: unknown): Record<string, unknown> {
  const d = info as K8sDeployment;
  const container = d.spec?.template?.spec?.containers?.[0];
  if (!container) return {};

  const result: Record<string, unknown> = {};

  if (container.image) result["image"] = container.image;

  if (container.env) {
    const env: Record<string, string> = {};
    for (const e of container.env) {
      if (e.value !== undefined) env[e.name] = e.value;
    }
    if (Object.keys(env).length > 0) result["env"] = env;
  }

  if (container.command) result["command"] = container.command;

  if (container.livenessProbe?.exec?.command) {
    const probe = container.livenessProbe;
    const hc: Record<string, unknown> = {};
    const cmd = probe.exec?.command;
    if (!cmd) return {};
    // exec probe: ["/bin/sh", "-c", "cmd"]
    if (cmd.length === 3 && cmd[0] === "/bin/sh" && cmd[1] === "-c") {
      hc["command"] = cmd[2];
    } else {
      hc["command"] = cmd.join(" ");
    }
    if (probe.periodSeconds) hc["interval"] = `${probe.periodSeconds}s`;
    if (probe.timeoutSeconds) hc["timeout"] = `${probe.timeoutSeconds}s`;
    if (probe.failureThreshold !== undefined)
      hc["retries"] = probe.failureThreshold;
    if (probe.initialDelaySeconds)
      hc["startPeriod"] = `${probe.initialDelaySeconds}s`;
    if (Object.keys(hc).length > 0) result["health"] = hc;
  }

  if (container.volumeMounts) {
    const mounts: { volume: string; path: string }[] = [];
    for (const vm of container.volumeMounts) {
      mounts.push({ volume: vm.name, path: vm.mountPath });
    }
    if (mounts.length > 0) result["mounts"] = mounts;
  }

  const replicas = d.spec?.replicas;
  if (replicas !== undefined && replicas !== 1) result["replicas"] = replicas;

  return result;
}
