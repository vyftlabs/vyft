/** URN — self-identifying resource address. */
export type URN = `urn:vyft:${string}:${string}:${string}:${string}`;

const URN_RE =
  /^urn:vyft:([a-z][a-z0-9_]*):([a-z][a-z0-9_]*):([a-z][a-z0-9_]*):(.+)$/;

export function buildURN(
  module: string,
  provider: string,
  resource: string,
  id: string,
): URN {
  return `urn:vyft:${module}:${provider}:${resource}:${id}` as URN;
}

export function parseURN(urn: URN): {
  module: string;
  provider: string;
  resource: string;
  id: string;
} {
  const match = URN_RE.exec(urn);
  if (!match) throw new Error(`Invalid URN: ${urn}`);
  return {
    module: match[1] as string,
    provider: match[2] as string,
    resource: match[3] as string,
    id: match[4] as string,
  };
}
