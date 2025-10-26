import * as path from 'path';
import * as os from 'os';

export function getVyftHome(): string {
  return path.join(os.homedir(), '.vyft');
}

export function getProviderStackPath(name: string): string {
  return path.join(getVyftHome(), 'providers', name);
}

export function getClusterPath(clusterId: string): string {
  return path.join(getVyftHome(), 'clusters', clusterId);
}
