import { Platform } from "@vyft/platform";
import { defineResource, VyftResourceError } from "@vyft/provider";

import { context } from "../context.ts";
import { labelSelector, resourceLabels } from "../helpers.ts";

export const server = defineResource(
  {
    context,
    schema: Platform.server,
  },
  {
    async create(id, config, { client }) {
      const { data, error } = await client.POST("/servers", {
        body: {
          name: config.name,
          server_type: config.serverType,
          image: config.image,
          ...(config.location !== undefined
            ? { location: config.location }
            : {}),
          ...(config.sshKeys !== undefined ? { ssh_keys: config.sshKeys } : {}),
          ...(config.userData !== undefined
            ? { user_data: config.userData }
            : {}),
          labels: resourceLabels(id.internal),
        },
      });

      if (error || !data?.server) {
        throw new VyftResourceError(
          id.internal,
          "PROVIDER_ERROR",
          `Failed to create server: ${JSON.stringify(error)}`,
        );
      }

      return {
        externalId: String(data.server.id),
        outputs: {
          serverId: data.server.id,
          ipv4: data.server.public_net.ipv4?.ip ?? "",
        },
      };
    },

    async read(id, { client }) {
      if (id.externalId) {
        const { data } = await client.GET("/servers/{id}", {
          params: { path: { id: Number(id.externalId) } },
        });
        if (!data?.server) return null;
        return {
          externalId: String(data.server.id),
          outputs: {
            serverId: data.server.id,
            ipv4: data.server.public_net.ipv4?.ip ?? "",
          },
        };
      }

      const { data } = await client.GET("/servers", {
        params: { query: { label_selector: labelSelector(id.internal) } },
      });

      const servers = data?.servers;
      if (!servers || servers.length === 0) return null;

      if (servers.length > 1) {
        throw new VyftResourceError(
          id.internal,
          "CONFLICT",
          "Multiple servers found for resource",
        );
      }

      const server = servers[0];
      if (!server) return null;
      return {
        externalId: String(server.id),
        outputs: {
          serverId: server.id,
          ipv4: server.public_net.ipv4?.ip ?? "",
        },
      };
    },

    async update(id, _config, { client }) {
      const serverId = Number(id.externalId);
      const { data, error } = await client.GET("/servers/{id}", {
        params: { path: { id: serverId } },
      });

      if (error || !data?.server) {
        throw new VyftResourceError(
          id.internal,
          "PROVIDER_ERROR",
          `Failed to read server for update: ${JSON.stringify(error)}`,
        );
      }

      return {
        externalId: String(data.server.id),
        outputs: {
          serverId: data.server.id,
          ipv4: data.server.public_net.ipv4?.ip ?? "",
        },
      };
    },

    async delete(id, { client }) {
      if (id.externalId) {
        await client.DELETE("/servers/{id}", {
          params: { path: { id: Number(id.externalId) } },
        });
        return;
      }

      const { data } = await client.GET("/servers", {
        params: { query: { label_selector: labelSelector(id.internal) } },
      });

      const servers = data?.servers ?? [];
      const server = servers[0];

      if (!server) {
        throw new VyftResourceError(
          id.internal,
          "NOT_FOUND",
          "Server not found",
        );
      }

      if (servers.length > 1) {
        throw new VyftResourceError(
          id.internal,
          "CONFLICT",
          "Multiple servers found for resource",
        );
      }

      await client.DELETE("/servers/{id}", {
        params: { path: { id: server.id } },
      });
    },
  },
);
