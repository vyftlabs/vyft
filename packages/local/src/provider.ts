import { definePlatform } from "@vyft/platform";
import { networkHandlers } from "./resource/network.ts";
import { serverHandlers } from "./resource/server.ts";
import { volumeHandlers } from "./resource/volume.ts";

export default definePlatform({
  name: "local",
  context: () => {},
  handlers: {
    server: serverHandlers,
    volume: volumeHandlers,
    network: networkHandlers,
  },
});
