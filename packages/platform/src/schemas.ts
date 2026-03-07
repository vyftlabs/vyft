export interface ServerInput {
  type: string;
  image: string;
  sshKeys?: string[];
  userData?: string;
}

export interface VolumeInput {
  size?: string;
}

export interface NetworkInput {
  cidr?: string;
}

export interface BucketInput {
  acl?: "private" | "public-read";
}

export interface PostgresInput {
  version?: string;
}

export interface QueueInput {
  durable?: boolean;
}

export interface SecretInput {
  length?: number;
  alphabet?: string;
}
