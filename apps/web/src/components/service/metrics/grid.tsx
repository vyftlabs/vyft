import { MetricSlot } from "./slot";

export function MetricsGrid({
  projectId,
  resourceId,
}: {
  projectId: string;
  resourceId: string;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <MetricSlot
          projectId={projectId}
          resourceId={resourceId}
          kind="requestRate"
        />
        <MetricSlot
          projectId={projectId}
          resourceId={resourceId}
          kind="errorRate"
        />
        <MetricSlot
          projectId={projectId}
          resourceId={resourceId}
          kind="latency"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricSlot projectId={projectId} resourceId={resourceId} kind="cpu" />
        <MetricSlot
          projectId={projectId}
          resourceId={resourceId}
          kind="memory"
        />
      </div>
    </div>
  );
}
