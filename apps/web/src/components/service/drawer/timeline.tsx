import {
  ArrowUpDownIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleDotIcon,
  DownloadIcon,
  HardDriveIcon,
  HeartPulseIcon,
  LoaderIcon,
  NetworkIcon,
  PencilIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ServerIcon,
  ServerOffIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { type KubeEventCategory, reasonCategory } from "./events";

// --- Types ---

export interface KubeEvent {
  id: string;
  type: "Normal" | "Warning";
  reason: string;
  message: string;
  timestamp: string;
}

export interface Deployment {
  id: string;
  image: string;
  previousImage?: string;
  status:
    | "rolling_out"
    | "succeeded"
    | "failed"
    | "rolling_back"
    | "rolled_back";
  startedAt: string;
  completedAt?: string;
  actor?: string;
  commit?: { sha: string; url?: string };
  events: KubeEvent[];
}

export type ActionType =
  | "scaled"
  | "config_updated"
  | "variable_added"
  | "variable_removed"
  | "route_added"
  | "route_removed"
  | "volume_attached"
  | "volume_detached"
  | "restarted";

export interface Action {
  id: string;
  type: ActionType;
  message: string;
  timestamp: string;
  actor?: string;
  events: KubeEvent[];
}

export type TimelineEntry =
  | { kind: "deployment"; deployment: Deployment }
  | { kind: "action"; action: Action }
  | { kind: "event"; event: KubeEvent };

export interface EventTimelineProps {
  entries: TimelineEntry[];
}

// --- Helpers ---

export function timeAgo(timestamp: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(timestamp).getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDuration(start: string, end?: string): string | null {
  if (!end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function imageTag(image: string): string {
  const tag = image.split(":")[1];
  return tag ?? "latest";
}

// --- Status styles ---

const deploymentStatusIcon: Record<Deployment["status"], React.ReactNode> = {
  rolling_out: (
    <LoaderIcon className="size-3.5 text-severity-info animate-spin" />
  ),
  succeeded: (
    <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
  ),
  failed: <XIcon className="size-3.5 text-severity-critical-text" />,
  rolling_back: (
    <LoaderIcon className="size-3.5 text-severity-warning-text animate-spin" />
  ),
  rolled_back: <RotateCcwIcon className="size-3.5 text-muted-foreground" />,
};

const deploymentStatusText: Record<Deployment["status"], string> = {
  rolling_out: "text-severity-info",
  succeeded: "text-emerald-600 dark:text-emerald-400",
  failed: "text-severity-critical-text",
  rolling_back: "text-severity-warning-text",
  rolled_back: "text-muted-foreground",
};

const deploymentStatusLabel: Record<Deployment["status"], string> = {
  rolling_out: "Rolling out",
  succeeded: "Deployed",
  failed: "Failed",
  rolling_back: "Rolling back",
  rolled_back: "Rolled back",
};

// --- Action icons ---

const actionIcon: Record<ActionType, React.ReactNode> = {
  scaled: <ArrowUpDownIcon className="size-3.5 text-muted-foreground" />,
  config_updated: <PencilIcon className="size-3.5 text-muted-foreground" />,
  variable_added: <PencilIcon className="size-3.5 text-muted-foreground" />,
  variable_removed: <PencilIcon className="size-3.5 text-muted-foreground" />,
  route_added: <NetworkIcon className="size-3.5 text-muted-foreground" />,
  route_removed: <NetworkIcon className="size-3.5 text-muted-foreground" />,
  volume_attached: <HardDriveIcon className="size-3.5 text-muted-foreground" />,
  volume_detached: <HardDriveIcon className="size-3.5 text-muted-foreground" />,
  restarted: <RefreshCwIcon className="size-3.5 text-muted-foreground" />,
};

// --- Event icons ---

const categoryIcon: Record<
  KubeEventCategory,
  (warning: boolean) => React.ReactNode
> = {
  container: (w) =>
    w ? (
      <RefreshCwIcon className="size-3 text-severity-warning-text" />
    ) : (
      <CheckIcon className="size-3 text-muted-foreground" />
    ),
  image: (w) =>
    w ? (
      <DownloadIcon className="size-3 text-severity-warning-text" />
    ) : (
      <DownloadIcon className="size-3 text-muted-foreground" />
    ),
  probe: () => <HeartPulseIcon className="size-3 text-severity-warning-text" />,
  scheduling: (w) =>
    w ? (
      <ServerOffIcon className="size-3 text-severity-warning-text" />
    ) : (
      <ServerIcon className="size-3 text-muted-foreground" />
    ),
  scaling: () => <ArrowUpDownIcon className="size-3 text-muted-foreground" />,
  volume: (w) =>
    w ? (
      <HardDriveIcon className="size-3 text-severity-warning-text" />
    ) : (
      <HardDriveIcon className="size-3 text-muted-foreground" />
    ),
  node: (w) =>
    w ? (
      <ServerOffIcon className="size-3 text-severity-critical-text" />
    ) : (
      <ServerIcon className="size-3 text-muted-foreground" />
    ),
  network: (w) =>
    w ? (
      <WifiOffIcon className="size-3 text-severity-warning-text" />
    ) : (
      <NetworkIcon className="size-3 text-muted-foreground" />
    ),
  lifecycle: () => <CircleDotIcon className="size-3 text-muted-foreground" />,
  unknown: () => <CircleDotIcon className="size-3 text-muted-foreground" />,
};

function eventIcon(
  reason: string,
  type: "Normal" | "Warning",
): React.ReactNode {
  const cat = reasonCategory(reason);
  return categoryIcon[cat](type === "Warning");
}

// --- Components ---

function DeploymentEntry({ deployment }: { deployment: Deployment }) {
  const [open, setOpen] = useState(
    deployment.status === "failed" ||
      deployment.status === "rolling_out" ||
      deployment.status === "rolling_back",
  );
  const duration = formatDuration(deployment.startedAt, deployment.completedAt);
  const hasEvents = deployment.events.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasEvents && setOpen(!open)}
        className={cn(
          "w-full text-left py-2 flex items-start gap-2",
          hasEvents && "cursor-pointer",
        )}
      >
        <span className="mt-0.5 shrink-0">
          {deploymentStatusIcon[deployment.status]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={cn(
                  "text-xs font-medium",
                  deploymentStatusText[deployment.status],
                )}
              >
                {deploymentStatusLabel[deployment.status]}
              </span>
              <span className="text-xs font-mono text-foreground truncate">
                {imageTag(deployment.image)}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {duration && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {duration}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {timeAgo(deployment.startedAt)}
              </span>
              {hasEvents && (
                <ChevronRightIcon
                  className={cn(
                    "size-3 text-muted-foreground transition-transform",
                    open && "rotate-90",
                  )}
                />
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {deployment.commit && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {deployment.commit.url ? (
                  <a
                    href={deployment.commit.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline underline-offset-2 hover:text-foreground transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {deployment.commit.sha.slice(0, 7)}
                  </a>
                ) : (
                  deployment.commit.sha.slice(0, 7)
                )}
              </span>
            )}
            {deployment.actor && (
              <span className="text-[10px] text-muted-foreground">
                {deployment.actor}
              </span>
            )}
            {deployment.previousImage && (
              <span className="text-[10px] text-muted-foreground">
                from {imageTag(deployment.previousImage)}
              </span>
            )}
          </div>
        </div>
      </button>

      {open && hasEvents && (
        <div className="ml-4 pl-3 border-l border-foreground/[0.06] space-y-0 mb-1">
          {deployment.events.map((ev) => (
            <KubeEventRow key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionEntry({ action }: { action: Action }) {
  const [open, setOpen] = useState(false);
  const hasEvents = action.events.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasEvents && setOpen(!open)}
        className={cn(
          "w-full text-left py-2 flex items-start gap-2",
          hasEvents && "cursor-pointer",
        )}
      >
        <span className="mt-0.5 shrink-0">{actionIcon[action.type]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">
              {action.message}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-muted-foreground">
                {timeAgo(action.timestamp)}
              </span>
              {hasEvents && (
                <ChevronRightIcon
                  className={cn(
                    "size-3 text-muted-foreground transition-transform",
                    open && "rotate-90",
                  )}
                />
              )}
            </div>
          </div>
          {action.actor && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {action.actor}
            </p>
          )}
        </div>
      </button>

      {open && hasEvents && (
        <div className="ml-4 pl-3 border-l border-foreground/[0.06] space-y-0 mb-1">
          {action.events.map((ev) => (
            <KubeEventRow key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}

function KubeEventRow({ event }: { event: KubeEvent }) {
  return (
    <div className="py-1 flex items-start gap-2">
      <span className="mt-0.5 shrink-0">
        {eventIcon(event.reason, event.type)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "text-[11px] font-medium",
              event.type === "Warning"
                ? "text-severity-warning-text"
                : "text-muted-foreground",
            )}
          >
            {event.reason}
          </p>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {timeAgo(event.timestamp)}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground leading-snug">
          {event.message}
        </p>
      </div>
    </div>
  );
}

export function EventTimeline({ entries }: EventTimelineProps) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {entries.map((entry) => {
        if (entry.kind === "deployment") {
          return (
            <DeploymentEntry
              key={entry.deployment.id}
              deployment={entry.deployment}
            />
          );
        }
        if (entry.kind === "action") {
          return <ActionEntry key={entry.action.id} action={entry.action} />;
        }
        return <KubeEventRow key={entry.event.id} event={entry.event} />;
      })}
    </div>
  );
}
