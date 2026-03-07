import { createClient } from "./client/index.ts";

export function createContext(opts: {
  project: string;
  stage: string;
  socketPath?: string;
}) {
  return {
    client: createClient(opts.socketPath),
    project: opts.project,
    stage: opts.stage,
    networkName: `vyft-${opts.project}-${opts.stage}`,
  };
}

export type DockerContext = ReturnType<typeof createContext>;
