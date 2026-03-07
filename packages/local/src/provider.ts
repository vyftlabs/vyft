import { definePlatform } from "@vyft/platform";
import { bucketHandlers } from "./resource/bucket.ts";
import { networkHandlers } from "./resource/network.ts";
import { queueHandlers } from "./resource/queue.ts";
import { serverHandlers } from "./resource/server.ts";
import { volumeHandlers } from "./resource/volume.ts";

export default definePlatform({
  name: "local",
  context: () => {},
  handlers: {
    server: serverHandlers,
    volume: volumeHandlers,
    network: networkHandlers,
    bucket: bucketHandlers,
    queue: queueHandlers,
  },
});
