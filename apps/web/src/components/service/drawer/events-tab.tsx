import { useQuery } from "@tanstack/react-query";
import type { ServiceEvent } from "@vyft/spec";
import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as api from "@/lib/api";
import { useResourceEventsStream } from "@/lib/api/events-stream";
import { cn } from "@/lib/utils";
import { isCriticalReason, isWarningReason } from "./events";
import { timeAgo } from "./timeline";

// EventList renders k8s events newest-first, colored by severity. Presentational
// — reused by the Events tab (all events) and the deployment detail (filtered to
// one deployment, where the per-event deployment chip is redundant).
export function EventList({
  events,
  showDeployment = true,
  empty = "No events in the last hour.",
}: {
  events: ServiceEvent[];
  showDeployment?: boolean;
  empty?: string;
}) {
  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground py-4">{empty}</p>;
  }
  return (
    <ScrollArea className="h-full -mr-6">
      <div className="divide-y [&>*:first-child]:pt-0 pr-6">
        {events.map((e) => {
          const critical = isCriticalReason(e.reason);
          const warning =
            !critical && (e.type === "Warning" || isWarningReason(e.reason));
          return (
            <div key={e.id} className="py-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "text-sm font-medium",
                    critical && "text-severity-critical-text",
                    warning && "text-severity-warning-text",
                  )}
                >
                  {e.reason}
                </span>
                {e.count > 1 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    ×{e.count}
                  </span>
                )}
                {showDeployment && e.deploymentId && (
                  <span
                    className="text-[10px] font-mono text-muted-foreground/60"
                    title={`Deployment ${e.deploymentId}`}
                  >
                    {e.deploymentId.slice(0, 7)}
                  </span>
                )}
                <span
                  className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums"
                  title={new Date(e.timestamp).toLocaleString()}
                >
                  {timeAgo(e.timestamp)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug break-words">
                {e.message}
              </p>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// EventsTab lists a resource's recent Kubernetes events (last ~1h), newest
// first. The REST query supplies the backlog + reconcile; the SSE stream pushes
// new events live into the same cache.
export function EventsTab({
  projectId,
  resourceId,
}: {
  projectId: string;
  resourceId: string;
}) {
  useResourceEventsStream(projectId, resourceId);
  const { data: events = [] } = useQuery(
    api.observability.events(projectId, resourceId),
  );
  // Cache is oldest-first (matches the REST backlog); show newest at top.
  const ordered = useMemo(() => [...events].reverse(), [events]);

  return <EventList events={ordered} />;
}
