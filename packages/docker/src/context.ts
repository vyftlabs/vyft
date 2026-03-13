import { createClient } from "./client/index.ts";

export function createContext(opts: {
  project: string;
  stage: string;
  socketPath?: string;
  publishPorts?: boolean;
}) {
  return {
    client: createClient(opts.socketPath),
    project: opts.project,
    stage: opts.stage,
    networkName: `vyft-${opts.project}-${opts.stage}`,
    publishPorts: opts.publishPorts ?? false,
  };
}

export type DockerContext = ReturnType<typeof createContext>;
