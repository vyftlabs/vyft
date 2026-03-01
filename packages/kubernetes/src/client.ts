/** Common K8s resource metadata. */
export interface K8sMetadata {
  name: string;
  namespace?: string;
  labels?: Record<string, string>;
}

/** Minimal typed manifest — all bodies passed to the client follow this shape. */
export interface K8sManifest {
  metadata: K8sMetadata;
  spec?: Record<string, unknown>;
  /** Allow extra top-level fields (apiVersion, kind, etc.). */
  [key: string]: unknown;
}

/** Narrow typed K8s client — exactly the operations used by helpers. */
export interface K8sClient {
  // ── Namespace ──
  readNamespace(args: { name: string }): Promise<K8sManifest>;
  createNamespace(args: { body: { metadata: K8sMetadata } }): Promise<void>;
  deleteNamespace(args: { name: string }): Promise<void>;

  // ── PersistentVolumeClaim ──
  readPVC(args: { namespace: string; name: string }): Promise<K8sManifest>;
  createPVC(args: { namespace: string; body: K8sManifest }): Promise<void>;
  deletePVC(args: { namespace: string; name: string }): Promise<void>;

  // ── Deployment ──
  readDeployment(args: {
    namespace: string;
    name: string;
  }): Promise<K8sManifest>;
  createDeployment(args: {
    namespace: string;
    body: K8sManifest;
  }): Promise<void>;
  replaceDeployment(args: {
    namespace: string;
    name: string;
    body: K8sManifest;
  }): Promise<void>;
  deleteDeployment(args: { namespace: string; name: string }): Promise<void>;

  // ── Service (ClusterIP) ──
  readService(args: { namespace: string; name: string }): Promise<K8sManifest>;
  createService(args: { namespace: string; body: K8sManifest }): Promise<void>;
  replaceService(args: {
    namespace: string;
    name: string;
    body: K8sManifest;
  }): Promise<void>;
  deleteService(args: { namespace: string; name: string }): Promise<void>;

  // ── CronJob ──
  readCronJob(args: { namespace: string; name: string }): Promise<K8sManifest>;
  createCronJob(args: { namespace: string; body: K8sManifest }): Promise<void>;
  replaceCronJob(args: {
    namespace: string;
    name: string;
    body: K8sManifest;
  }): Promise<void>;
  deleteCronJob(args: { namespace: string; name: string }): Promise<void>;

  // ── Pod (read-only) ──
  listPods(args: {
    namespace: string;
    labelSelector?: string;
  }): Promise<{ items: K8sManifest[] }>;

  // ── Ingress ──
  createIngress(args: { namespace: string; body: K8sManifest }): Promise<void>;
  replaceIngress(args: {
    namespace: string;
    name: string;
    body: K8sManifest;
  }): Promise<void>;
  deleteIngress(args: { namespace: string; name: string }): Promise<void>;
}

let cached: K8sClient | null = null;

/** Discards API response — write methods return void. */
function ignore(_: unknown): void {}
/** Type assertion — @kubernetes/client-node ^1.4.0 returns raw K8s objects directly (no { body } wrapper). */
function toManifest(res: unknown): K8sManifest {
  return res as K8sManifest;
}

/** Load the Kubernetes client. Throws a clear error if the package isn't installed. */
export async function loadK8sClient(): Promise<K8sClient> {
  if (cached) return cached;

  let mod: typeof import("@kubernetes/client-node");
  try {
    mod = await import("@kubernetes/client-node");
  } catch {
    throw new Error(
      "The @kubernetes/client-node package is required for the k8s runtime. " +
        "Install it with: pnpm add @kubernetes/client-node",
    );
  }

  const kc = new mod.KubeConfig();
  kc.loadFromDefault();
  const core = kc.makeApiClient(mod.CoreV1Api);
  const apps = kc.makeApiClient(mod.AppsV1Api);
  const batch = kc.makeApiClient(mod.BatchV1Api);
  const networking = kc.makeApiClient(mod.NetworkingV1Api);

  // Cast body args — narrow K8sManifest ≠ specific V1* types from @kubernetes/client-node.
  // All `as never` casts are confined to this adapter so helpers pass plain objects.
  cached = {
    readNamespace: (a) => core.readNamespace(a).then(toManifest),
    createNamespace: (a) => core.createNamespace(a as never).then(ignore),
    deleteNamespace: (a) => core.deleteNamespace(a).then(ignore),
    readPVC: (a) =>
      core.readNamespacedPersistentVolumeClaim(a).then(toManifest),
    createPVC: (a) =>
      core.createNamespacedPersistentVolumeClaim(a as never).then(ignore),
    deletePVC: (a) =>
      core.deleteNamespacedPersistentVolumeClaim(a).then(ignore),
    readDeployment: (a) => apps.readNamespacedDeployment(a).then(toManifest),
    createDeployment: (a) =>
      apps.createNamespacedDeployment(a as never).then(ignore),
    replaceDeployment: (a) =>
      apps.replaceNamespacedDeployment(a as never).then(ignore),
    deleteDeployment: (a) => apps.deleteNamespacedDeployment(a).then(ignore),
    readService: (a) => core.readNamespacedService(a).then(toManifest),
    createService: (a) => core.createNamespacedService(a as never).then(ignore),
    replaceService: (a) =>
      core.replaceNamespacedService(a as never).then(ignore),
    deleteService: (a) => core.deleteNamespacedService(a).then(ignore),
    readCronJob: (a) => batch.readNamespacedCronJob(a).then(toManifest),
    createCronJob: (a) =>
      batch.createNamespacedCronJob(a as never).then(ignore),
    replaceCronJob: (a) =>
      batch.replaceNamespacedCronJob(a as never).then(ignore),
    deleteCronJob: (a) => batch.deleteNamespacedCronJob(a).then(ignore),
    listPods: (a) =>
      core.listNamespacedPod(a as never).then((res) => ({
        items: (res as { items: unknown[] }).items.map(toManifest),
      })),
    createIngress: (a) =>
      networking.createNamespacedIngress(a as never).then(ignore),
    replaceIngress: (a) =>
      networking.replaceNamespacedIngress(a as never).then(ignore),
    deleteIngress: (a) => networking.deleteNamespacedIngress(a).then(ignore),
  };
  return cached;
}
