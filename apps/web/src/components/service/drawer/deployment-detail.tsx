import { useQuery } from "@tanstack/react-query";
import type { Deployment } from "@vyft/spec";
import { useMemo } from "react";
import * as api from "@/lib/api";
import { useResourceEventsStream } from "@/lib/api/events-stream";
import { cn } from "@/lib/utils";
import { LogsPanel } from "../logs/panel";
import { EventList } from "./events-tab";
import { timeAgo } from "./timeline";

const statusLabel: Record<Deployment["status"], string> = {
  pending: "Queued",
  applying: "Deploying",
  applied: "Deployed",
  failed: "Failed",
};

// DeploymentDetail is the master→detail view inside the Deployments tab: it
// scopes events and logs to one deployment's rollout. Events come from the
// resource event feed filtered by the correlated deploymentId; logs are scoped
// server-side to that rollout's pods (pod-template-hash). Returning to the list
// is via clicking the Deployments tab (no back button).
export function DeploymentDetail({
  deployment,
  projectId,
  resourceId,
  title,
  live,
}: {
  deployment: Deployment;
  projectId: string;
  resourceId: string;
  // Inferred change summary ("Updated image", "Scaled to 3"); falls back to the
  // status word.
  title?: string;
  // Whether this is the newest deployment (its pods still run) — drives a live
  // log tail vs a static historical view.
  live?: boolean;
}) {
  useResourceEventsStream(projectId, resourceId);
  const { data: allEvents = [] } = useQuery(
    api.observability.events(projectId, resourceId),
  );
  const events = useMemo(
    () =>
      allEvents
        .filter((e) => e.deploymentId === deployment.id)
        .reverse(), // newest first
    [allEvents, deployment.id],
  );

  const failed = deployment.status === "failed";

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-semibold leading-none",
              failed && "text-severity-critical-text",
            )}
          >
            {title ?? statusLabel[deployment.status]}
          </span>
          <span className="font-mono text-xs text-muted-foreground/60">
            {deployment.id.slice(0, 7)}
          </span>
          <span
            className="ml-auto text-xs leading-none text-muted-foreground tabular-nums"
            title={new Date(deployment.createdAt).toLocaleString()}
          >
            {timeAgo(deployment.createdAt)}
          </span>
        </div>
        {deployment.error && (
          <p className="mt-2 text-[11px] text-severity-critical-text leading-snug">
            {deployment.error}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <EventList
          events={events}
          showDeployment={false}
          empty="No events for this deployment."
        />
      </div>

      <div className="h-px shrink-0 bg-border" />

      <div className="min-h-0 flex-[2]">
        <LogsPanel
          projectId={projectId}
          resourceId={resourceId}
          deploymentId={deployment.id}
          live={live}
        />
      </div>
    </div>
  );
}
