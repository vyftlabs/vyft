export type ResourceHandle = {
  /** Human name as entered in the UI (e.g. "nginx"). */
  name: string;
  /** Backend-derived DNS-1123 slug (e.g. "nginx-a1b2c3"). Used in k8s labels. */
  slug: string;
};

export type ProjectHandle = {
  slug: string;
  name: string;
  /** Cluster namespace for the default `production` environment. */
  namespace: string;
  /** Resources created on this project, keyed by their UI name. */
  resources: Record<string, ResourceHandle>;
};
