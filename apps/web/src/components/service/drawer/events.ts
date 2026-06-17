// Canonical Kubernetes event reasons, grouped by source.
// ref: k8s.io/kubernetes/pkg/kubelet/events, k8s.io/api/core/v1, controller sources

export type KubeEventCategory =
  | "container"
  | "image"
  | "probe"
  | "scheduling"
  | "scaling"
  | "volume"
  | "node"
  | "network"
  | "lifecycle"
  | "unknown";

// --- Well-known reasons ---

// Kubelet: container lifecycle
const containerReasons = [
  "Created",
  "Started",
  "Failed",
  "Killing",
  "Preempting",
  "BackOff",
  "ExceededGracePeriod",
  "ContainerCreating",
  "ContainerGCFailed",
  "OOMKilling",
] as const;

// Kubelet: image
const imageReasons = [
  "Pulling",
  "Pulled",
  "ErrImagePull",
  "ImagePullBackOff",
  "ErrImageNeverPull",
  "InspectFailed",
] as const;

// Kubelet: probes
const probeReasons = [
  "Unhealthy",
  "ProbeWarning",
  "FailedPostStartHook",
  "FailedPreStopHook",
] as const;

// Scheduler
const schedulingReasons = [
  "Scheduled",
  "FailedScheduling",
  "Preempted",
  "WaitingForGates",
] as const;

// Deployment / ReplicaSet controllers
const scalingReasons = [
  "ScalingReplicaSet",
  "SuccessfulCreate",
  "FailedCreate",
  "SuccessfulDelete",
  "FailedDelete",
  "DeploymentRollback",
  "SuccessfulRescale",
  "DesiredReplicasComputed",
  "FailedComputeMetricsReplicas",
  "FailedGetResourceMetric",
  "InvalidMetricSourceType",
] as const;

// Volume
const volumeReasons = [
  "FailedAttachVolume",
  "SuccessfulAttachVolume",
  "FailedMount",
  "SuccessfulMountVolume",
  "FailedDetach",
  "FailedBinding",
  "ProvisioningSucceeded",
  "ProvisioningFailed",
  "ExternalProvisioning",
  "VolumeResizeFailed",
  "VolumeResizeSuccessful",
  "FileSystemResizeFailed",
  "FileSystemResizeSuccessful",
] as const;

// Node
const nodeReasons = [
  "NodeReady",
  "NodeNotReady",
  "NodeSchedulable",
  "NodeNotSchedulable",
  "Rebooted",
  "Starting",
  "NodeHasSufficientMemory",
  "NodeHasNoDiskPressure",
  "NodeHasSufficientPID",
  "NodeHasInsufficientMemory",
  "NodeHasDiskPressure",
  "NodeHasInsufficientPID",
  "EvictionThresholdMet",
  "Evicted",
  "OOMKilled",
] as const;

// Network / sandbox
const networkReasons = [
  "FailedCreatePodSandBox",
  "NetworkNotReady",
  "SandboxChanged",
] as const;

// Pod lifecycle
const lifecycleReasons = [
  "LeaderElection",
  "SawCompletedJob",
  "FailedSync",
  "SuccessfulRescale",
  "TaintManagerEviction",
  "TerminatingEvictedPod",
] as const;

export type ContainerReason = (typeof containerReasons)[number];
export type ImageReason = (typeof imageReasons)[number];
export type ProbeReason = (typeof probeReasons)[number];
export type SchedulingReason = (typeof schedulingReasons)[number];
export type ScalingReason = (typeof scalingReasons)[number];
export type VolumeReason = (typeof volumeReasons)[number];
export type NodeReason = (typeof nodeReasons)[number];
export type NetworkReason = (typeof networkReasons)[number];
export type LifecycleReason = (typeof lifecycleReasons)[number];

export type KnownReason =
  | ContainerReason
  | ImageReason
  | ProbeReason
  | SchedulingReason
  | ScalingReason
  | VolumeReason
  | NodeReason
  | NetworkReason
  | LifecycleReason;

// Build a reason → category lookup
const categoryMap = new Map<string, KubeEventCategory>([
  ...containerReasons.map((r) => [r, "container"] as const),
  ...imageReasons.map((r) => [r, "image"] as const),
  ...probeReasons.map((r) => [r, "probe"] as const),
  ...schedulingReasons.map((r) => [r, "scheduling"] as const),
  ...scalingReasons.map((r) => [r, "scaling"] as const),
  ...volumeReasons.map((r) => [r, "volume"] as const),
  ...nodeReasons.map((r) => [r, "node"] as const),
  ...networkReasons.map((r) => [r, "network"] as const),
  ...lifecycleReasons.map((r) => [r, "lifecycle"] as const),
]);

export function reasonCategory(reason: string): KubeEventCategory {
  return categoryMap.get(reason) ?? "unknown";
}

// Whether a reason typically indicates a problem
const warningReasons = new Set<string>([
  "Failed",
  "BackOff",
  "ExceededGracePeriod",
  "ContainerGCFailed",
  "OOMKilling",
  "ErrImagePull",
  "ImagePullBackOff",
  "ErrImageNeverPull",
  "InspectFailed",
  "Unhealthy",
  "ProbeWarning",
  "FailedPostStartHook",
  "FailedPreStopHook",
  "FailedScheduling",
  "FailedCreate",
  "FailedDelete",
  "FailedComputeMetricsReplicas",
  "FailedGetResourceMetric",
  "InvalidMetricSourceType",
  "FailedAttachVolume",
  "FailedMount",
  "FailedDetach",
  "FailedBinding",
  "ProvisioningFailed",
  "VolumeResizeFailed",
  "FileSystemResizeFailed",
  "NodeNotReady",
  "NodeNotSchedulable",
  "NodeHasInsufficientMemory",
  "NodeHasDiskPressure",
  "NodeHasInsufficientPID",
  "EvictionThresholdMet",
  "Evicted",
  "OOMKilled",
  "FailedCreatePodSandBox",
  "NetworkNotReady",
  "FailedSync",
  "TaintManagerEviction",
]);

export function isWarningReason(reason: string): boolean {
  return warningReasons.has(reason);
}

// Hard failures — a subset of warnings that mean the workload is broken and
// needs intervention (vs. transient/recoverable warnings). Rendered red.
const criticalReasons = new Set<string>([
  "Failed",
  "BackOff",
  "CrashLoopBackOff",
  "ErrImagePull",
  "ImagePullBackOff",
  "ErrImageNeverPull",
  "OOMKilling",
  "OOMKilled",
  "Evicted",
  "FailedScheduling",
  "FailedCreate",
  "FailedCreatePodSandBox",
  "FailedMount",
  "FailedAttachVolume",
  "FailedSync",
  "TaintManagerEviction",
]);

export function isCriticalReason(reason: string): boolean {
  return criticalReasons.has(reason);
}
