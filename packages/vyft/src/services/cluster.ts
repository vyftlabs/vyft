import { LocalWorkspace, Stack } from '@pulumi/pulumi/automation/index.js';
import { existsSync, unlinkSync } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getVyftHome } from '../config.js';
import { ClusterCreateSchema } from '../validators/cluster.js';
import { destroyClusterInfrastructure } from './provisioning.js';
import {
  ensureFileExists,
  ensureDirectoryExists,
  readJsonFile,
  writeJsonFile,
} from '../utils/fs.js';

interface ClusterInfo {
  id: string;
  name: string;
  type: string;
  regions: string[];
  size: string;
  providerId: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

const VYFT_HOME = getVyftHome();
const CLUSTERS_DIR = path.join(VYFT_HOME, 'clusters');
const CLUSTERS_FILE = path.join(CLUSTERS_DIR, 'clusters.json');
const CURRENT_CONTEXT_FILE = path.join(CLUSTERS_DIR, 'current-context.json');

async function ensureVyftHome(): Promise<void> {
  await ensureDirectoryExists(VYFT_HOME);
  await ensureDirectoryExists(CLUSTERS_DIR);
}

async function loadClusters(): Promise<Record<string, ClusterInfo>> {
  await ensureVyftHome();

  const clusters =
    await readJsonFile<Record<string, ClusterInfo>>(CLUSTERS_FILE);
  if (!clusters) {
    return {};
  }

  let needsSave = false;
  for (const clusterId in clusters) {
    const cluster = clusters[clusterId];
    if (!cluster) {
      continue;
    }
    if (cluster.nodeCount === undefined) {
      cluster.nodeCount = cluster.size === 'ha' ? 3 : 1;
      needsSave = true;
    }
  }

  if (needsSave) {
    await saveClusters(clusters);
  }

  return clusters;
}

async function saveClusters(
  clusters: Record<string, ClusterInfo>,
): Promise<void> {
  await ensureVyftHome();
  await writeJsonFile(CLUSTERS_FILE, clusters);
}

async function getWorkspace(passphrase: string): Promise<LocalWorkspace> {
  await ensureVyftHome();

  const pulumiYamlPath = path.join(CLUSTERS_DIR, 'Pulumi.yaml');
  const pulumiYaml = `name: vyft-clusters
runtime: nodejs
description: Vyft cluster secrets management
`;
  await ensureFileExists(pulumiYamlPath, pulumiYaml);

  const indexJsPath = path.join(CLUSTERS_DIR, 'index.js');
  const indexJs = `// Vyft cluster secrets management
// This file is required by Pulumi but not used for our secrets storage
`;
  await ensureFileExists(indexJsPath, indexJs);

  const workspace = await LocalWorkspace.create({
    workDir: CLUSTERS_DIR,
    envVars: {
      PULUMI_CONFIG_PASSPHRASE: passphrase,
    },
  });

  try {
    await Stack.create('vyft', workspace);
  } catch (error) {
    try {
      await Stack.select('vyft', workspace);
    } catch (selectError) {
      throw new Error(`Failed to create or select stack: ${selectError}`);
    }
  }

  return workspace;
}

export async function createCluster(
  name: string,
  type: 'kubernetes',
  regions: string[],
  size: string,
  providerId: string,
  passphrase: string,
): Promise<string> {
  const validation = ClusterCreateSchema.safeParse({
    name,
    type,
    regions,
    size,
    providerId,
  });
  if (!validation.success) {
    throw new Error(
      `Validation failed: ${validation.error.issues.map((e) => e.message).join(', ')}`,
    );
  }

  const clusterId = randomUUID();

  const clusters = await loadClusters();
  clusters[clusterId] = {
    id: clusterId,
    name,
    type,
    regions,
    size,
    providerId,
    nodeCount: size === 'ha' ? 3 : 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveClusters(clusters);

  const workspace = await getWorkspace(passphrase);
  await workspace.setConfig('vyft', `cluster_${clusterId}_kubeconfig`, {
    value: 'placeholder-kubeconfig',
    secret: true,
  });

  return clusterId;
}

export async function storeClusterK3sToken(
  clusterId: string,
  k3sToken: string,
  passphrase: string,
): Promise<void> {
  const workspace = await getWorkspace(passphrase);
  await workspace.setConfig('vyft', `cluster_${clusterId}_k3s_token`, {
    value: k3sToken,
    secret: true,
  });
}

export async function getClusterK3sToken(
  clusterId: string,
  passphrase: string,
): Promise<string | undefined> {
  try {
    const workspace = await getWorkspace(passphrase);
    const config = await workspace.getConfig(
      'vyft',
      `cluster_${clusterId}_k3s_token`,
    );
    return config?.value;
  } catch (error) {
    return undefined;
  }
}

export async function updateClusterNodeCount(
  clusterId: string,
  newNodeCount: number,
): Promise<void> {
  const clusters = await loadClusters();
  const cluster = clusters[clusterId];

  if (!cluster) {
    throw new Error(`Cluster with ID ${clusterId} not found`);
  }

  cluster.nodeCount = newNodeCount;
  cluster.updatedAt = new Date().toISOString();
  await saveClusters(clusters);
}

export async function listClusters(): Promise<ClusterInfo[]> {
  const clusters = await loadClusters();
  return Object.values(clusters);
}

export async function getClusterKubeconfig(
  clusterId: string,
  passphrase: string,
): Promise<string | undefined> {
  try {
    const workspace = await getWorkspace(passphrase as string);
    const config = await workspace.getConfig(
      'vyft',
      `cluster_${clusterId}_kubeconfig`,
    );
    return config?.value;
  } catch (error) {
    return undefined;
  }
}

export async function getClusterById(
  clusterId: string,
): Promise<ClusterInfo | undefined> {
  const clusters = await loadClusters();
  return clusters[clusterId];
}

export async function findClustersByName(name: string): Promise<ClusterInfo[]> {
  const clusters = await listClusters();
  return clusters.filter((c) => c.name === name);
}

interface CurrentContext {
  clusterId: string;
  clusterName: string;
  setAt: string;
}

export async function setCurrentCluster(clusterId: string): Promise<void> {
  const clusters = await loadClusters();
  const cluster = clusters[clusterId];

  if (!cluster) {
    throw new Error(`Cluster with ID ${clusterId} not found`);
  }

  const context: CurrentContext = {
    clusterId,
    clusterName: cluster.name,
    setAt: new Date().toISOString(),
  };

  await ensureVyftHome();
  await writeJsonFile(CURRENT_CONTEXT_FILE, context);
}

export async function getCurrentCluster(): Promise<string | undefined> {
  if (!existsSync(CURRENT_CONTEXT_FILE)) {
    return undefined;
  }

  try {
    const context = await readJsonFile<CurrentContext>(CURRENT_CONTEXT_FILE);
    if (!context) {
      return undefined;
    }

    const clusters = await loadClusters();
    if (!clusters[context.clusterId]) {
      await clearCurrentCluster();
      return undefined;
    }

    return context.clusterId;
  } catch (error) {
    return undefined;
  }
}

export function clearCurrentCluster(): void {
  if (existsSync(CURRENT_CONTEXT_FILE)) {
    unlinkSync(CURRENT_CONTEXT_FILE);
  }
}

export async function getCurrentClusterInfo(): Promise<
  ClusterInfo | undefined
> {
  const currentClusterId = await getCurrentCluster();
  if (!currentClusterId) {
    return undefined;
  }

  const clusters = await loadClusters();
  return clusters[currentClusterId];
}

export async function destroyCluster(
  clusterId: string,
  passphrase: string,
): Promise<void> {
  await destroyClusterInfrastructure(clusterId, passphrase);

  const currentClusterId = await getCurrentCluster();
  if (currentClusterId === clusterId) {
    await clearCurrentCluster();
  }

  const clusters = await loadClusters();
  delete clusters[clusterId];
  await saveClusters(clusters);

  try {
    const workspace = await getWorkspace(passphrase);
    await workspace.removeConfig('vyft', `cluster_${clusterId}_kubeconfig`);
  } catch (error) {}
}
