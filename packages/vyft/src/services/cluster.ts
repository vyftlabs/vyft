import { LocalWorkspace, Stack } from '@pulumi/pulumi/automation/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getVyftHome } from '../config.js';
import { ClusterCreateSchema } from '../validators/cluster.js';
import { destroyClusterInfrastructure } from './provisioning.js';

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

function ensureVyftHome(): void {
  if (!fs.existsSync(VYFT_HOME)) {
    fs.mkdirSync(VYFT_HOME, { recursive: true });
  }
  if (!fs.existsSync(CLUSTERS_DIR)) {
    fs.mkdirSync(CLUSTERS_DIR, { recursive: true });
  }
}

function loadClusters(): Record<string, ClusterInfo> {
  ensureVyftHome();

  if (!fs.existsSync(CLUSTERS_FILE)) {
    return {};
  }

  try {
    const data = fs.readFileSync(CLUSTERS_FILE, 'utf8');
    const clusters = JSON.parse(data);

    // Migrate existing clusters that don't have nodeCount
    let needsSave = false;
    for (const clusterId in clusters) {
      const cluster = clusters[clusterId];
      if (cluster.nodeCount === undefined) {
        cluster.nodeCount = cluster.size === 'ha' ? 3 : 1;
        needsSave = true;
      }
    }

    if (needsSave) {
      saveClusters(clusters);
    }

    return clusters;
  } catch (error) {
    return {};
  }
}

function saveClusters(clusters: Record<string, ClusterInfo>): void {
  ensureVyftHome();
  fs.writeFileSync(CLUSTERS_FILE, JSON.stringify(clusters, null, 2));
}

async function getWorkspace(passphrase: string): Promise<LocalWorkspace> {
  ensureVyftHome();

  const pulumiYamlPath = path.join(CLUSTERS_DIR, 'Pulumi.yaml');
  if (!fs.existsSync(pulumiYamlPath)) {
    const pulumiYaml = `name: vyft-clusters
runtime: nodejs
description: Vyft cluster secrets management
`;
    fs.writeFileSync(pulumiYamlPath, pulumiYaml);
  }

  const indexJsPath = path.join(CLUSTERS_DIR, 'index.js');
  if (!fs.existsSync(indexJsPath)) {
    const indexJs = `// Vyft cluster secrets management
// This file is required by Pulumi but not used for our secrets storage
`;
    fs.writeFileSync(indexJsPath, indexJs);
  }

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

  const clusters = loadClusters();
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
  saveClusters(clusters);

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

export function updateClusterNodeCount(
  clusterId: string,
  newNodeCount: number,
): void {
  const clusters = loadClusters();
  const cluster = clusters[clusterId];

  if (!cluster) {
    throw new Error(`Cluster with ID ${clusterId} not found`);
  }

  cluster.nodeCount = newNodeCount;
  cluster.updatedAt = new Date().toISOString();
  saveClusters(clusters);
}

export async function listClusters(): Promise<ClusterInfo[]> {
  const clusters = loadClusters();
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
  const clusters = loadClusters();
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

export function setCurrentCluster(clusterId: string): void {
  const clusters = loadClusters();
  const cluster = clusters[clusterId];

  if (!cluster) {
    throw new Error(`Cluster with ID ${clusterId} not found`);
  }

  const context: CurrentContext = {
    clusterId,
    clusterName: cluster.name,
    setAt: new Date().toISOString(),
  };

  ensureVyftHome();
  fs.writeFileSync(CURRENT_CONTEXT_FILE, JSON.stringify(context, null, 2));
}

export function getCurrentCluster(): string | undefined {
  if (!fs.existsSync(CURRENT_CONTEXT_FILE)) {
    return undefined;
  }

  try {
    const data = fs.readFileSync(CURRENT_CONTEXT_FILE, 'utf8');
    const context: CurrentContext = JSON.parse(data);

    const clusters = loadClusters();
    if (!clusters[context.clusterId]) {
      clearCurrentCluster();
      return undefined;
    }

    return context.clusterId;
  } catch (error) {
    return undefined;
  }
}

export function clearCurrentCluster(): void {
  if (fs.existsSync(CURRENT_CONTEXT_FILE)) {
    fs.unlinkSync(CURRENT_CONTEXT_FILE);
  }
}

export function getCurrentClusterInfo(): ClusterInfo | undefined {
  const currentClusterId = getCurrentCluster();
  if (!currentClusterId) {
    return undefined;
  }

  const clusters = loadClusters();
  return clusters[currentClusterId];
}

export async function destroyCluster(
  clusterId: string,
  passphrase: string,
): Promise<void> {
  await destroyClusterInfrastructure(clusterId, passphrase);

  const currentClusterId = getCurrentCluster();
  if (currentClusterId === clusterId) {
    clearCurrentCluster();
  }

  const clusters = loadClusters();
  delete clusters[clusterId];
  saveClusters(clusters);

  try {
    const workspace = await getWorkspace(passphrase);
    await workspace.removeConfig('vyft', `cluster_${clusterId}_kubeconfig`);
  } catch (error) {}
}
