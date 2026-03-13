import { buildHandlers } from "./resource/build.ts";
import { cronjobHandlers } from "./resource/cronjob.ts";
import { jobHandlers } from "./resource/job.ts";
import network from "./resource/network.ts";
import proxy from "./resource/proxy.ts";
import { serviceHandlers } from "./resource/service.ts";
import { volumeHandlers } from "./resource/volume.ts";
import { docker } from "./runtime.ts";

export default docker.define({
  service: serviceHandlers,
  volume: volumeHandlers,
  job: jobHandlers,
  build: buildHandlers,
  cronjob: cronjobHandlers,
  init: (opts) => {
    const networkName = `vyft-${opts.project}-${opts.stage}`;
    network("default", { name: networkName });
    proxy("default", { name: `${opts.project}-${opts.stage}`, networkName });
  },
});
