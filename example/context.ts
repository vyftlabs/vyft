/**
 * Creates a context object for use in provider methods,
 * similar to how tRPC passes context to procedures.
 *
 * Add any values (authentication, user, db, etc.) you want
 * procedures to receive here.
 */
export interface Context {
  user?: { id: string; name?: string };
  // Add additional context properties here as needed
}

/**
 * Call this from your framework's request handler/root to create a context.
 * For example, you could extract user info from a request object.
 */
export async function createContext(): Promise<Context> {
  // Populate context here (auth, database, etc.)
  return {};
}
