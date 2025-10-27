import { LocalWorkspace, Stack } from '@pulumi/pulumi/automation/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getVyftHome } from '../config.js';
import { validateHetznerToken, ProviderCreateSchema } from '../validators.js';

interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  addedAt: string;
}

const VYFT_HOME = getVyftHome();
const PROVIDERS_DIR = path.join(VYFT_HOME, 'providers');
const PROVIDERS_FILE = path.join(PROVIDERS_DIR, 'providers.json');

function ensureVyftHome(): void {
  if (!fs.existsSync(VYFT_HOME)) {
    fs.mkdirSync(VYFT_HOME, { recursive: true });
  }
  if (!fs.existsSync(PROVIDERS_DIR)) {
    fs.mkdirSync(PROVIDERS_DIR, { recursive: true });
  }
}

function loadProviders(): Record<string, ProviderInfo> {
  ensureVyftHome();

  if (!fs.existsSync(PROVIDERS_FILE)) {
    return {};
  }

  try {
    const data = fs.readFileSync(PROVIDERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

function saveProviders(providers: Record<string, ProviderInfo>): void {
  ensureVyftHome();
  fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(providers, null, 2));
}

async function getWorkspace(passphrase: string): Promise<LocalWorkspace> {
  ensureVyftHome();

  const pulumiYamlPath = path.join(PROVIDERS_DIR, 'Pulumi.yaml');
  if (!fs.existsSync(pulumiYamlPath)) {
    const pulumiYaml = `name: vyft-providers
runtime: nodejs
description: Vyft provider secrets management
`;
    fs.writeFileSync(pulumiYamlPath, pulumiYaml);
  }

  const indexJsPath = path.join(PROVIDERS_DIR, 'index.js');
  if (!fs.existsSync(indexJsPath)) {
    const indexJs = `// Vyft provider secrets management
// This file is required by Pulumi but not used for our secrets storage
`;
    fs.writeFileSync(indexJsPath, indexJs);
  }

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

  const providers = loadProviders();
  providers[providerId] = {
    id: providerId,
    name,
    type,
    addedAt: new Date().toISOString(),
  };
  saveProviders(providers);

  const workspace = await getWorkspace(passphrase);
  await workspace.setConfig('vyft', `provider_${providerId}_token`, {
    value: token,
    secret: true,
  });

  return providerId;
}

export async function listProviders(): Promise<ProviderInfo[]> {
  const providers = loadProviders();
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
  const providers = loadProviders();
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
  const providers = loadProviders();
  delete providers[providerId];
  saveProviders(providers);

  try {
    const workspace = await getWorkspace(passphrase);
    await workspace.removeConfig('vyft', `provider_${providerId}_token`);
  } catch (error) {}
}
