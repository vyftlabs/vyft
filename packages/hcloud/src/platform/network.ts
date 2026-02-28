import { Platform } from "@vyft/platform";
import { defineResource, VyftResourceError } from "@vyft/provider";

import { context } from "../context.ts";
import { labelSelector, resourceLabels } from "../helpers.ts";

export const network = defineResource(
  {
    context,
    schema: Platform.network,
  },
  {
    async create(id, config, { client }) {
      const { data, error } = await client.POST("/networks", {
        body: {
          name: config.name,
          ip_range: config.ipRange,
          labels: resourceLabels(id.internal),
          subnets: [
            {
              type: "cloud",
              network_zone: config.zone,
              ip_range: config.ipRange,
            },
          ],
        },
      });

      if (error || !data?.network) {
        throw new VyftResourceError(
          id.internal,
          "PROVIDER_ERROR",
          `Failed to create network: ${JSON.stringify(error)}`,
        );
      }

      return {
        externalId: String(data.network.id),
        outputs: { networkId: data.network.id },
      };
    },

    async read(id, { client }) {
      if (id.externalId) {
        const { data } = await client.GET("/networks/{id}", {
          params: { path: { id: Number(id.externalId) } },
        });
        if (!data?.network) return null;
        return {
          externalId: String(data.network.id),
          outputs: { networkId: data.network.id },
        };
      }

      const { data } = await client.GET("/networks", {
        params: { query: { label_selector: labelSelector(id.internal) } },
      });

      const networks = data?.networks;
      if (!networks || networks.length === 0) return null;

      if (networks.length > 1) {
        throw new VyftResourceError(
          id.internal,
          "CONFLICT",
          "Multiple networks found for resource",
        );
      }

      const network = networks[0];
      if (!network) return null;
      return {
        externalId: String(network.id),
        outputs: { networkId: network.id },
      };
    },

    async update(id, config, { client }) {
      const networkId = Number(id.externalId);
      const { data, error } = await client.PUT("/networks/{id}", {
        params: { path: { id: networkId } },
        body: {
          name: config.name,
          labels: resourceLabels(id.internal),
        },
      });

      if (error || !data?.network) {
        throw new VyftResourceError(
          id.internal,
          "PROVIDER_ERROR",
          `Failed to update network: ${JSON.stringify(error)}`,
        );
      }

      return {
        externalId: String(data.network.id),
        outputs: { networkId: data.network.id },
      };
    },

    async delete(id, { client }) {
      if (id.externalId) {
        await client.DELETE("/networks/{id}", {
          params: { path: { id: Number(id.externalId) } },
        });
        return;
      }

      const { data } = await client.GET("/networks", {
        params: { query: { label_selector: labelSelector(id.internal) } },
      });

      const networks = data?.networks ?? [];
      const network = networks[0];

      if (!network) {
        throw new VyftResourceError(
          id.internal,
          "NOT_FOUND",
          "Network not found",
        );
      }

      if (networks.length > 1) {
        throw new VyftResourceError(
          id.internal,
          "CONFLICT",
          "Multiple networks found for resource",
        );
      }

      await client.DELETE("/networks/{id}", {
        params: { path: { id: network.id } },
      });
    },
  },
);
