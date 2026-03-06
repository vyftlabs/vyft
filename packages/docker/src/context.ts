import type { DockerClient } from "./client.ts";

export interface DockerContext {
  client: DockerClient;
  project: string;
  stage: string;
  networkName: string;
}
