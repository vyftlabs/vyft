# @vyft/platform

Standard module shape for compute infrastructure. Providers implement this contract to offer network and server resources.

## Usage

```ts
import { Platform } from "@vyft/platform";
import { defineModule, defineResource } from "@vyft/provider";

const networkResource = defineResource({ name: "network" }, {
  async create(id, config, ctx) {
    // provision a network with config.name, config.ipRange, config.zone
    return { externalId: "net-1", outputs: { networkId: 1 } };
  },
});

const serverResource = defineResource({ name: "server" }, {
  async create(id, config, ctx) {
    // provision a server with config.name, config.serverType, config.image
    return { externalId: "srv-1", outputs: { serverId: 1, ipv4: "1.2.3.4" } };
  },
});

export default defineModule(Platform, {
  network: networkResource,
  server: serverResource,
});
```

## Resources

| Resource | Config | Outputs |
|----------|--------|---------|
| `network` | `name`, `ipRange`, `zone` | `networkId` |
| `server` | `name`, `serverType`, `image`, `location?`, `sshKeys?`, `userData?` | `serverId`, `ipv4` |
