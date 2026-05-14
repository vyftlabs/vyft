export type ProjectHandle = {
  slug: string;
  name: string;
  /** Cluster namespace for the default `production` environment. */
  namespace: string;
};
