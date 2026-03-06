export interface ServiceOutput {
  host: string;
  port: number;
  url: string;
  containerId?: string;
}

export interface VolumeOutput {
  name: string;
}

export interface CronJobOutput {
  name: string;
  containerId?: string;
}
