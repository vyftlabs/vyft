import { createProvider } from "@vyft/provider";
import {
  randomBytes,
  randomInteger,
  randomString,
  randomUuid,
  sshKeyPair,
} from "./crypto/index.ts";
import { file, glob, template } from "./fs/index.ts";
import { exec } from "./process/index.ts";
import { ssh } from "./ssh.ts";

const std = createProvider({
  name: "std",
  context: async () => ({}),
  resources: {
    fs: {
      file,
      glob,
      template,
    },
    crypto: {
      randomBytes,
      randomInteger,
      randomString,
      randomUuid,
      sshKeyPair,
    },
    process: {
      exec,
    },
    ssh,
  },
});

export default std;
