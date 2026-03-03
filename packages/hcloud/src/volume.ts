/**
 * Hetzner Cloud volume resource handler.
 */

import { VyftResourceError } from "@vyft/provider";

import { labelSelector, resourceLabels, t } from "./mod.ts";

function parseSize(size?: string): number {
  if (!size) return 10; // Default 10GB

  const match = size.match(/^(\d+)(Gi?)?$/i);
  if (!match?.[1]) return 10;

  return parseInt(match[1], 10);
}

export const volume = t.volume({
  async create({ id, input, ctx }) {
    const sizeGb = parseSize(input.size);

    const { data, error } = await ctx.client.POST("/volumes", {
      body: {
        name: `vyft-${id.internal}`,
        size: sizeGb,
        location: "fsn1", // Default location
        labels: resourceLabels(id.internal),
      },
    });

    if (error || !data?.volume) {
      throw new VyftResourceError(
        id.internal,
        "PROVIDER_ERROR",
        `Failed to create volume: ${JSON.stringify(error)}`,
      );
    }

    return {
      externalId: String(data.volume.id),
      output: {
        name: data.volume.name,
      },
    };
  },

  async read({ id, ctx }) {
    if (id.externalId) {
      const { data } = await ctx.client.GET("/volumes/{id}", {
        params: { path: { id: Number(id.externalId) } },
      });
      if (!data?.volume) return null;
      return {
        externalId: String(data.volume.id),
        output: {
          name: data.volume.name,
        },
      };
    }

    const { data } = await ctx.client.GET("/volumes", {
      params: { query: { label_selector: labelSelector(id.internal) } },
    });

    const volumes = data?.volumes;
    if (!volumes || volumes.length === 0) return null;

    if (volumes.length > 1) {
      throw new VyftResourceError(
        id.internal,
        "CONFLICT",
        "Multiple volumes found for resource",
      );
    }

    const volume = volumes[0];
    if (!volume) return null;
    return {
      externalId: String(volume.id),
      output: {
        name: volume.name,
      },
    };
  },

  async update({ id, ctx }) {
    const volumeId = Number(id.externalId);
    const { data, error } = await ctx.client.PUT("/volumes/{id}", {
      params: { path: { id: volumeId } },
      body: {
        name: `vyft-${id.internal}`,
        labels: resourceLabels(id.internal),
      },
    });

    if (error || !data?.volume) {
      throw new VyftResourceError(
        id.internal,
        "PROVIDER_ERROR",
        `Failed to update volume: ${JSON.stringify(error)}`,
      );
    }

    return {
      externalId: String(data.volume.id),
      output: {
        name: data.volume.name,
      },
    };
  },

  async delete({ id, ctx }) {
    if (id.externalId) {
      await ctx.client.DELETE("/volumes/{id}", {
        params: { path: { id: Number(id.externalId) } },
      });
      return;
    }

    const { data } = await ctx.client.GET("/volumes", {
      params: { query: { label_selector: labelSelector(id.internal) } },
    });

    const volumes = data?.volumes ?? [];
    const volume = volumes[0];

    if (!volume) {
      throw new VyftResourceError(id.internal, "NOT_FOUND", "Volume not found");
    }

    if (volumes.length > 1) {
      throw new VyftResourceError(
        id.internal,
        "CONFLICT",
        "Multiple volumes found for resource",
      );
    }

    await ctx.client.DELETE("/volumes/{id}", {
      params: { path: { id: volume.id } },
    });
  },
});
