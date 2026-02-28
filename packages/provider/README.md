# @vyft/provider

Framework for building infrastructure providers with typed resource lifecycles.

## Usage

```ts
import {
  defineProviderContext,
  defineModuleShape,
  defineModule,
  defineResource,
  defineProvider,
} from "@vyft/provider";
import { z } from "zod";

const MyShape = defineModuleShape("my-provider", {
  bucket: {
    config: z.object({ name: z.string(), region: z.string() }),
    outputs: z.object({ bucketId: z.string(), url: z.string() }),
  },
});

const bucketResource = defineResource({ name: "bucket" }, {
  async create(id, config, ctx) {
    const bucket = await ctx.client.createBucket(config);
    return { externalId: bucket.id, outputs: { bucketId: bucket.id, url: bucket.url } };
  },
  async delete(id, ctx) {
    await ctx.client.deleteBucket(id.externalId);
  },
});

const myModule = defineModule(MyShape, { bucket: bucketResource });

const context = defineProviderContext({
  name: "my-provider",
  secrets: ["apiKey"],
  async setup(secrets) {
    return { client: new MyClient(secrets.apiKey) };
  },
});

export default defineProvider({ context, modules: [myModule] });
```

## Exports

- `defineProviderContext(options)` — provider setup with secrets and initialization
- `defineModuleShape(namespace, shape)` — declare resource types with Zod schemas
- `defineModule(shape, resources)` — bind resource handlers to a shape
- `defineResource(options, handler)` — implement create/read/update/delete lifecycle
- `defineProvider(options)` — assemble a complete provider
- `VyftResourceError` — typed error with codes: `NOT_FOUND`, `CONFLICT`, `ALREADY_EXISTS`, `INVALID_CONFIG`, `PROVIDER_ERROR`, `TIMEOUT`
