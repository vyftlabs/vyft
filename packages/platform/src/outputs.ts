export interface ServerOutput {
  id: string;
  host: string;
  privateKey: string;
}

export interface VolumeOutput {
  name: string;
}

export interface NetworkOutput {
  id: string;
}

export interface BucketOutput {
  name: string;
  url: string;
}

export interface PostgresOutput {
  host: string;
  port: number;
  url: string;
}

export interface QueueOutput {
  name: string;
  url: string;
}

export interface SecretOutput {
  value: string;
}
