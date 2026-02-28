const LABEL_KEY = "vyft.dev/resource/id";

export function resourceLabels(id: string): Record<string, string> {
  return { [LABEL_KEY]: id };
}

export function labelSelector(id: string): string {
  return `${LABEL_KEY}=${id}`;
}
