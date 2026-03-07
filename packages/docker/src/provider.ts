import { defineRuntime } from "@vyft/runtime";
import { createContext } from "./context.ts";
import { cronjobHandlers } from "./resource/cronjob.ts";
import { serviceHandlers } from "./resource/service.ts";
import { volumeHandlers } from "./resource/volume.ts";

export default defineRuntime({
  name: "docker",
  context: createContext,
  handlers: {
    service: serviceHandlers,
    volume: volumeHandlers,
    cronjob: cronjobHandlers,
  },
});
