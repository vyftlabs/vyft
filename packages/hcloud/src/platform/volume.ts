import { Platform } from "@vyft/platform";
import { defineResource, VyftResourceError } from "@vyft/provider";

import { context } from "../context.ts";
import { labelSelector, resourceLabels } from "../helpers.ts";

export const volume = defineResource(
  {
    context,
    schema: Platform.volume,
  },
  {
    async create(id, config, { client }) {
      const { data, error } = await client.POST("/volumes", {
        body: {
          name: config.name,
          size: config.size,
          location: config.location,
          ...(config.format !== undefined ? { format: config.format } : {}),
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
        outputs: {
          volumeId: data.volume.id,
          linuxDevice: data.volume.linux_device,
        },
      };
    },

    async read(id, { client }) {
      if (id.externalId) {
        const { data } = await client.GET("/volumes/{id}", {
          params: { path: { id: Number(id.externalId) } },
        });
        if (!data?.volume) return null;
        return {
          externalId: String(data.volume.id),
          outputs: {
            volumeId: data.volume.id,
            linuxDevice: data.volume.linux_device,
          },
        };
      }

      const { data } = await client.GET("/volumes", {
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
        outputs: {
          volumeId: volume.id,
          linuxDevice: volume.linux_device,
        },
      };
    },

    async update(id, config, { client }) {
      const volumeId = Number(id.externalId);
      const { data, error } = await client.PUT("/volumes/{id}", {
        params: { path: { id: volumeId } },
        body: {
          name: config.name,
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
        outputs: {
          volumeId: data.volume.id,
          linuxDevice: data.volume.linux_device,
        },
      };
    },

    async delete(id, { client }) {
      if (id.externalId) {
        await client.DELETE("/volumes/{id}", {
          params: { path: { id: Number(id.externalId) } },
        });
        return;
      }

      const { data } = await client.GET("/volumes", {
        params: { query: { label_selector: labelSelector(id.internal) } },
      });

      const volumes = data?.volumes ?? [];
      const volume = volumes[0];

      if (!volume) {
        throw new VyftResourceError(
          id.internal,
          "NOT_FOUND",
          "Volume not found",
        );
      }

      if (volumes.length > 1) {
        throw new VyftResourceError(
          id.internal,
          "CONFLICT",
          "Multiple volumes found for resource",
        );
      }

      await client.DELETE("/volumes/{id}", {
        params: { path: { id: volume.id } },
      });
    },
  },
);
