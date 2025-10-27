import { LocalWorkspace, Stack } from '@pulumi/pulumi/automation/index.js';
import { existsSync } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getVyftHome } from '../config.js';
import { validateHetznerToken, ProviderCreateSchema } from '../validators.js';
import {
  ensureFileExists,
  ensureDirectoryExists,
  readJsonFile,
  writeJsonFile,
} from '../utils/fs.js';

interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  addedAt: string;
}

const VYFT_HOME = getVyftHome();
const PROVIDERS_DIR = path.join(VYFT_HOME, 'providers');
const PROVIDERS_FILE = path.join(PROVIDERS_DIR, 'providers.json');

async function ensureVyftHome(): Promise<void> {
  await ensureDirectoryExists(VYFT_HOME);
  await ensureDirectoryExists(PROVIDERS_DIR);
}

async function loadProviders(): Promise<Record<string, ProviderInfo>> {
  await ensureVyftHome();
  return (
    (await readJsonFile<Record<string, ProviderInfo>>(PROVIDERS_FILE)) || {}
  );
}

async function saveProviders(
  providers: Record<string, ProviderInfo>,
): Promise<void> {
  await ensureVyftHome();
  await writeJsonFile(PROVIDERS_FILE, providers);
}

async function getWorkspace(passphrase: string): Promise<LocalWorkspace> {
  await ensureVyftHome();

  const pulumiYamlPath = path.join(PROVIDERS_DIR, 'Pulumi.yaml');
  const pulumiYaml = `name: vyft-providers
runtime: nodejs
description: Vyft provider secrets management
`;
  await ensureFileExists(pulumiYamlPath, pulumiYaml);

  const indexJsPath = path.join(PROVIDERS_DIR, 'index.js');
  const indexJs = `// Vyft provider secrets management
// This file is required by Pulumi but not used for our secrets storage
`;
  await ensureFileExists(indexJsPath, indexJs);

  const workspace = await LocalWorkspace.create({
    workDir: PROVIDERS_DIR,
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

export async function createProvider(
  name: string,
  type: 'hetzner',
  token: string,
  passphrase: string,
): Promise<string> {
  const validation = ProviderCreateSchema.safeParse({ name, type, token });
  if (!validation.success) {
    throw new Error(
      `Validation failed: ${validation.error.issues.map((e) => e.message).join(', ')}`,
    );
  }

  const isValidToken = await validateHetznerToken(token);
  if (!isValidToken) {
    throw new Error('Invalid API token');
  }

  const providerId = randomUUID();

  const providers = await loadProviders();
  providers[providerId] = {
    id: providerId,
    name,
    type,
    addedAt: new Date().toISOString(),
  };
  await saveProviders(providers);

  const workspace = await getWorkspace(passphrase);
  await workspace.setConfig('vyft', `provider_${providerId}_token`, {
    value: token,
    secret: true,
  });

  return providerId;
}

export async function listProviders(): Promise<ProviderInfo[]> {
  const providers = await loadProviders();
  return Object.values(providers);
}

export async function getProviderToken(
  providerId: string,
  passphrase: string,
): Promise<string | undefined> {
  try {
    const workspace = await getWorkspace(passphrase);
    const config = await workspace.getConfig(
      'vyft',
      `provider_${providerId}_token`,
    );
    return config?.value;
  } catch (error) {
    return undefined;
  }
}

export async function getProviderById(
  providerId: string,
): Promise<ProviderInfo | undefined> {
  const providers = await loadProviders();
  return providers[providerId];
}

export async function findProviderByName(
  name: string,
): Promise<ProviderInfo[]> {
  const providers = await listProviders();
  return providers.filter((p) => p.name === name);
}

export async function destroyProvider(
  providerId: string,
  passphrase: string,
): Promise<void> {
  const providers = await loadProviders();
  delete providers[providerId];
  await saveProviders(providers);

  try {
    const workspace = await getWorkspace(passphrase);
    await workspace.removeConfig('vyft', `provider_${providerId}_token`);
  } catch (error) {}
}
