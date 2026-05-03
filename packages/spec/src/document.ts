import { createDocument } from "zod-openapi"
import { projectPaths } from "./paths/projects.ts"
import { resourcePaths } from "./paths/resources.ts"
import { variablePaths } from "./paths/variables.ts"
import { routePaths } from "./paths/routes.ts"
import { volumePaths } from "./paths/volumes.ts"
import { registryPaths } from "./paths/registries.ts"
import { deploymentPaths } from "./paths/deployments.ts"
import { observabilityPaths } from "./paths/observability.ts"

export const document = createDocument({
  openapi: "3.1.0",
  info: {
    title: "Vyft API",
    version: "0.1.0",
    description: "Vyft API contract — single source of truth for all clients and servers.",
  },
  servers: [{ url: "/api", description: "Default" }],
  tags: [
    { name: "Projects" },
    { name: "Resources" },
    { name: "Variables" },
    { name: "Routes" },
    { name: "Volumes" },
    { name: "Registries" },
    { name: "Deployments" },
    { name: "Observability" },
  ],
  paths: {
    ...projectPaths,
    ...resourcePaths,
    ...variablePaths,
    ...routePaths,
    ...volumePaths,
    ...registryPaths,
    ...deploymentPaths,
    ...observabilityPaths,
  },
})
