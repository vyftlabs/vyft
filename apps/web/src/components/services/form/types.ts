export interface GeneralFormValues {
  name: string
  image: string
  port: string
  command: string
}

export interface ScalingFormValues {
  replicas: string
  cpuRequest: string
  cpuLimit: string
  memoryRequest: string
  memoryLimit: string
}

export interface HealthFormValues {
  healthCheckType: string
  healthCheckPath: string
  healthCheckPort: string
  healthCheckCommand: string
}

export interface VariableEntry {
  key: string
  value: string
  secret?: boolean
  sourceVariableId?: string
}

export interface RouteFormEntry {
  id?: string
  domain: string
  path: string
  pathType: string
  port: number
  tls: boolean
}

export interface VolumeFormEntry {
  id?: string
  name: string
  size: string
  mountPath: string
}

export interface RouteFormValues {
  domain: string
  path: string
  pathType: string
  port: number
  tls: boolean
}

export type ServiceFormValues = GeneralFormValues & ScalingFormValues & HealthFormValues & {
  variables: VariableEntry[]
  volumes: VolumeFormEntry[]
  routes: RouteFormValues[]
}

export const defaultGeneralValues: GeneralFormValues = {
  name: "",
  image: "",
  port: "8080",
  command: "",
}

export const defaultScalingValues: ScalingFormValues = {
  replicas: "1",
  cpuRequest: "100m",
  cpuLimit: "500m",
  memoryRequest: "128Mi",
  memoryLimit: "512Mi",
}

export const defaultHealthValues: HealthFormValues = {
  healthCheckType: "none",
  healthCheckPath: "/health",
  healthCheckPort: "",
  healthCheckCommand: "",
}

export const defaultServiceFormValues: ServiceFormValues = {
  ...defaultGeneralValues,
  ...defaultScalingValues,
  ...defaultHealthValues,
  variables: [],
  volumes: [],
  routes: [],
}
