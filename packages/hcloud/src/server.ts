/**
 * Hetzner Cloud server resource handler.
 */

import { VyftResourceError } from "@vyft/provider";

import { labelSelector, resourceLabels, t } from "./mod.ts";

export const server = t.server({
  async create({ id, input, ctx }) {
    const { data, error } = await ctx.client.POST("/servers", {
      body: {
        name: `vyft-${id.internal}`,
        server_type: input.type,
        image: input.image,
        ...(input.sshKeys?.length ? { ssh_keys: input.sshKeys } : {}),
        ...(input.userData ? { user_data: input.userData } : {}),
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
      output: {
        ip: data.server.public_net.ipv4?.ip ?? "",
        id: String(data.server.id),
      },
    };
  },

  async read({ id, ctx }) {
    if (id.externalId) {
      const { data } = await ctx.client.GET("/servers/{id}", {
        params: { path: { id: Number(id.externalId) } },
      });
      if (!data?.server) return null;
      return {
        externalId: String(data.server.id),
        output: {
          ip: data.server.public_net.ipv4?.ip ?? "",
          id: String(data.server.id),
        },
      };
    }

    const { data } = await ctx.client.GET("/servers", {
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
      output: {
        ip: server.public_net.ipv4?.ip ?? "",
        id: String(server.id),
      },
    };
  },

  async update({ id, ctx }) {
    const serverId = Number(id.externalId);
    const { data, error } = await ctx.client.GET("/servers/{id}", {
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
      output: {
        ip: data.server.public_net.ipv4?.ip ?? "",
        id: String(data.server.id),
      },
    };
  },

  async delete({ id, ctx }) {
    if (id.externalId) {
      await ctx.client.DELETE("/servers/{id}", {
        params: { path: { id: Number(id.externalId) } },
      });
      return;
    }

    const { data } = await ctx.client.GET("/servers", {
      params: { query: { label_selector: labelSelector(id.internal) } },
    });

    const servers = data?.servers ?? [];
    const server = servers[0];

    if (!server) {
      throw new VyftResourceError(id.internal, "NOT_FOUND", "Server not found");
    }

    if (servers.length > 1) {
      throw new VyftResourceError(
        id.internal,
        "CONFLICT",
        "Multiple servers found for resource",
      );
    }

    await ctx.client.DELETE("/servers/{id}", {
      params: { path: { id: server.id } },
    });
  },
});
