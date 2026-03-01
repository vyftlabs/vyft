import { defineProvider } from "@vyft/provider";

import { context } from "./context.ts";
import { randomBytes } from "./resources/random-bytes.ts";
import { randomInteger } from "./resources/random-integer.ts";
import { randomString } from "./resources/random-string.ts";
import { randomUuid } from "./resources/random-uuid.ts";
import { sshKeyPair } from "./resources/ssh-key-pair.ts";

export default defineProvider({
  context,
  resources: [randomString, sshKeyPair, randomUuid, randomInteger, randomBytes],
});
