import { defineRuntime } from "@vyft/runtime";
import { createContext } from "./context.ts";
import { cronjobHandlers } from "./resource/cronjob.ts";
import { jobHandlers } from "./resource/job.ts";
import { serviceHandlers } from "./resource/service.ts";
import { volumeHandlers } from "./resource/volume.ts";

export default defineRuntime({
  name: "docker",
  context: createContext,
  handlers: {
    service: serviceHandlers,
    job: jobHandlers,
    volume: volumeHandlers,
    cronjob: cronjobHandlers,
  },
});
