import { test } from "../src/index.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// These 4 tests each sleep 500ms
// Sequential: ~2000ms total
// Concurrent: ~500ms total

export const timing1 = test({
  name: "timing test 1 (500ms)",
  run: async () => {
    await sleep(500);
  },
});

export const timing2 = test({
  name: "timing test 2 (500ms)",
  run: async () => {
    await sleep(500);
  },
});

export const timing3 = test({
  name: "timing test 3 (500ms)",
  run: async () => {
    await sleep(500);
  },
});

export const timing4 = test({
  name: "timing test 4 (500ms)",
  run: async () => {
    await sleep(500);
  },
});
