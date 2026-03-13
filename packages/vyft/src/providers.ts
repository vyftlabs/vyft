import type { Provider } from "@vyft/core";
import docker from "@vyft/docker";
import local from "@vyft/local";

type ProviderFactory = (opts: {
  project: string;
  stage: string;
}) => Provider<unknown>;

export const runtimes = new Map<string, ProviderFactory>([
  ["docker", ({ project, stage }) => docker({ project, stage })],
]);

export const platforms = new Map<string, ProviderFactory>([
  ["remote", () => local({})],
]);
