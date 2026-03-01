/** Wraps setup → run → cleanup into a single async function for commander actions. */
export function withLifecycle<S>(hooks: {
  // biome-ignore lint/suspicious/noExplicitAny: commander passes variadic arguments
  setup: (...args: any[]) => Promise<S>;
  run: (state: S) => Promise<void>;
  cleanup: (state: S | undefined) => Promise<void>;
  // biome-ignore lint/suspicious/noExplicitAny: commander passes variadic arguments
}): (...args: any[]) => Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: commander passes variadic arguments
  return async (...args: any[]) => {
    let state: S | undefined;
    try {
      state = await hooks.setup(...args);
      await hooks.run(state);
    } finally {
      await hooks.cleanup(state);
    }
  };
}
