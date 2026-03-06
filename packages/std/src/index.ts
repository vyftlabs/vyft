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

export default createProvider({
  context: async () => ({}),
  resources: {
    file,
    glob,
    template,
    randomBytes,
    randomInteger,
    randomString,
    randomUuid,
    sshKeyPair,
    exec,
    ssh,
  },
});
