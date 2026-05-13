import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import { MetricSlot } from "./slot";

// 503 unreachable from the capabilities endpoint is its own panel state
// in the spec — match the strict error shape produced by the backend.
function isUnreachable(err: unknown): boolean {
  return err instanceof ApiError && err.code === "INTERNAL";
}

export function MetricsGrid({
  projectId,
  resourceId,
}: {
  projectId: string;
  resourceId: string;
}) {
  const capQuery = useQuery({
    ...api.observability.metricsCapabilities(projectId, resourceId),
    enabled: !!projectId && !!resourceId,
  });

  const capabilities = capQuery.data;
  const unreachable = capQuery.isError && isUnreachable(capQuery.error);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <MetricSlot
          projectId={projectId}
          resourceId={resourceId}
          kind="reqRate"
          capabilities={capabilities}
          capabilitiesError={unreachable}
        />
        <MetricSlot
          projectId={projectId}
          resourceId={resourceId}
          kind="errRate"
          capabilities={capabilities}
          capabilitiesError={unreachable}
        />
        <MetricSlot
          projectId={projectId}
          resourceId={resourceId}
          kind="latency"
          capabilities={capabilities}
          capabilitiesError={unreachable}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricSlot
          projectId={projectId}
          resourceId={resourceId}
          kind="cpu"
          capabilities={capabilities}
          capabilitiesError={unreachable}
        />
        <MetricSlot
          projectId={projectId}
          resourceId={resourceId}
          kind="memory"
          capabilities={capabilities}
          capabilitiesError={unreachable}
        />
      </div>
    </div>
  );
}
