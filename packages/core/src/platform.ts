export interface ServerInput {
  name: string;
  size: string;
}

export interface VolumeInput {
  size: number;
  zone: string;
}

export interface NetworkInput {
  cidr: string;
}

export type PlatformResourceName = "server" | "volume" | "network";
