/** URN — self-identifying resource address. */
export type URN = `urn:vyft:${string}:${string}:${string}:${string}`;

const URN_PREFIX = "urn:vyft:";
const URN_SEGMENT = /^[a-z][a-z0-9_]*$/;

function build(
  module: string,
  provider: string,
  resource: string,
  id: string,
): URN {
  return `urn:vyft:${module}:${provider}:${resource}:${id}`;
}

function parse(value: string): {
  module: string;
  provider: string;
  resource: string;
  id: string;
} {
  if (!value.startsWith(URN_PREFIX)) {
    throw new Error(`Invalid URN: ${value}`);
  }

  const rest = value.slice(URN_PREFIX.length);
  const [module, provider, resource, ...idParts] = rest.split(":");

  if (!module || !provider || !resource || idParts.length === 0) {
    throw new Error(`Invalid URN: ${value}`);
  }

  const id = idParts.join(":");

  if (
    !URN_SEGMENT.test(module) ||
    !URN_SEGMENT.test(provider) ||
    !URN_SEGMENT.test(resource)
  ) {
    throw new Error(`Invalid URN segment: ${value}`);
  }

  return { module, provider, resource, id };
}

export const urn = { build, parse };
