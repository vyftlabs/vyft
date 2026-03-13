export interface ServiceInput {
  name: string;
  image?: string | undefined;
  path?: string | undefined;
  cwd?: string | undefined;
  port: number;
  domain?: string | undefined;
  env?: Record<string, string> | undefined;
  command?: string[] | undefined;
  mounts?: Array<{ source: string; target: string }> | undefined;
  health?:
    | {
        path?: string | undefined;
        command?: string | undefined;
        interval?: string | undefined;
        timeout?: string | undefined;
        retries?: number | undefined;
      }
    | undefined;
  restart: "always" | "on-failure" | "unless-stopped" | "no";
}

export interface VolumeInput {
  name: string;
  size?: string | undefined;
}

export interface JobInput {
  name: string;
  image?: string | undefined;
  path?: string | undefined;
  cwd?: string | undefined;
  command?: string[] | undefined;
  env?: Record<string, string> | undefined;
  mounts?: Array<{ source: string; target: string }> | undefined;
}

export interface BuildInput {
  name: string;
  path: string;
  cwd?: string | undefined;
  start?: string | undefined;
}

export interface CronJobInput {
  name: string;
  schedule: string;
  image?: string | undefined;
  path?: string | undefined;
  cwd?: string | undefined;
  command?: string[] | undefined;
  env?: Record<string, string> | undefined;
  mounts?: Array<{ source: string; target: string }> | undefined;
  health?:
    | {
        path?: string | undefined;
        command?: string | undefined;
        interval?: string | undefined;
        timeout?: string | undefined;
        retries?: number | undefined;
      }
    | undefined;
  restart: "always" | "on-failure" | "unless-stopped" | "no";
}
