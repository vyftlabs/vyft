import { createDocument } from "zod-openapi";
import { deploymentPaths } from "./paths/deployments.ts";
import { environmentPaths } from "./paths/environments.ts";
import { observabilityPaths } from "./paths/observability.ts";
import { projectPaths } from "./paths/projects.ts";
import { registryPaths } from "./paths/registries.ts";
import { resourcePaths } from "./paths/resources.ts";
import { routePaths } from "./paths/routes.ts";
import { sourcePaths } from "./paths/sources.ts";
import { variablePaths } from "./paths/variables.ts";

export const document = createDocument({
  openapi: "3.0.3",
  info: {
    title: "Vyft API",
    version: "0.1.0",
    description:
      "Vyft API contract — single source of truth for all clients and servers.",
  },
  servers: [{ url: "/api", description: "Default" }],
  tags: [
    { name: "Projects" },
    { name: "Environments" },
    { name: "Resources" },
    { name: "Variables" },
    { name: "Routes" },
    { name: "Registries" },
    { name: "Deployments" },
    { name: "Observability" },
    { name: "Sources" },
  ],
  paths: {
    ...projectPaths,
    ...environmentPaths,
    ...resourcePaths,
    ...variablePaths,
    ...routePaths,
    ...registryPaths,
    ...deploymentPaths,
    ...observabilityPaths,
    ...sourcePaths,
  },
});
