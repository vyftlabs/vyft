/**
 * Platform shape types for infrastructure provisioning.
 *
 * These define the config/state contracts that platform handlers implement.
 */

export interface SSHConnection {
  host: string;
  privateKey: string;
}

export interface PlatformServerConfig {
  /** Server type/size (e.g., "cx11", "t3.micro") */
  type: string;
  /** OS image */
  image: string;
  /** SSH keys */
  sshKeys?: string[];
  /** User data / cloud-init */
  userData?: string;
}

export interface PlatformServerState extends SSHConnection {
  /** Server ID */
  id: string;
}

export interface PlatformBucketConfig {
  /** Access control: private or public-read */
  acl?: "private" | "public-read";
}

export interface PlatformBucketState {
  url: string;
  name: string;
}

export interface PlatformPostgresConfig {
  /** Postgres version (e.g., "16", "15") */
  version?: string;
}

export interface PlatformPostgresState {
  /** Connection URL */
  url: string;
  /** Database host */
  host: string;
  /** Database port */
  port: number;
}

export interface PlatformQueueConfig {
  durable?: boolean;
}

export interface PlatformQueueState {
  url: string;
  name: string;
}

export interface PlatformSecretConfig {
  /** Length for generated secrets */
  length?: number;
  /** Character set for generated secrets */
  alphabet?: string;
}

export interface PlatformSecretState {
  /** The secret value (only available at runtime, not stored in state) */
  value: string;
}

export interface PlatformVolumeConfig {
  /** Size of the volume (e.g., "10Gi") */
  size?: string;
}

export interface PlatformVolumeState {
  /** Volume identifier for mounting */
  name: string;
}
