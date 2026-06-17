import { Handle, type NodeProps, Position } from "@xyflow/react";
import { BoxIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type ServiceState =
  | "running" // healthy, all replicas ready
  | "pending" // deploying, scaling, creating, pulling image, scheduling
  | "degraded" // partial failure — some replicas unhealthy
  | "failed" // CrashLoopBackOff, OOMKilled, ImagePullBackOff, ErrImagePull, CreateContainerConfigError
  | "stopped" // scaled to 0 intentionally
  | "terminating" // being deleted
  | "unknown"; // node unreachable, state undetermined

export interface ServiceStatus {
  state: ServiceState;
  message?: string;
}

export interface ServiceNodeData extends Record<string, unknown> {
  label: string;
  image?: string;
  status: ServiceStatus;
  deployedAt?: string;
  onClick?: () => void;
  onHover?: () => void;
}

const RECENTLY_DEPLOYED_MINUTES = 10;

const imageSlugMap: Record<string, string> = {
  postgres: "postgresql",
  nginx: "nginx",
  redis: "redis",
  mysql: "mysql",
  mongo: "mongodb",
  mongodb: "mongodb",
  node: "nodedotjs",
  python: "python",
  ruby: "ruby",
  php: "php",
  golang: "go",
  go: "go",
  mariadb: "mariadb",
  rabbitmq: "rabbitmq",
  elasticsearch: "elasticsearch",
  grafana: "grafana",
  prometheus: "prometheus",
};

function getIconSlug(image?: string): string | null {
  if (!image) return null;
  const name = image.split(":")[0]?.split("/").pop() || "";
  return imageSlugMap[name] || null;
}

function getImageTag(image?: string): string | null {
  if (!image) return null;
  // sha256 digest: ghcr.io/acme/api@sha256:a3f8c2d... → api@a3f8c2d
  if (image.includes("@sha256:")) {
    const [repo, digest] = image.split("@sha256:");
    if (!repo) return null;
    const name = repo.split("/").pop() || repo;
    return digest ? `${name}@${digest.slice(0, 7)}` : null;
  }
  // tag: ghcr.io/acme/api:v1.2.3 → v1.2.3
  const parts = image.split(":");
  if (parts.length > 1) {
    const tag = parts[parts.length - 1] ?? "";
    return tag === "latest" ? null : tag;
  }
  return null;
}

const iconSizes = { xs: "size-3", sm: "size-4", md: "size-5" } as const;

export function ServiceIcon({
  image,
  size = "md",
}: {
  image?: string;
  size?: keyof typeof iconSizes;
}) {
  const slug = getIconSlug(image);
  const sizeClass = iconSizes[size];
  if (!slug) return <BoxIcon className={sizeClass} />;
  const url = `https://cdn.simpleicons.org/${slug}`;
  return (
    <div
      className={`${sizeClass} bg-foreground/80`}
      style={{
        maskImage: `url(${url})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskImage: `url(${url})`,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

function useRecentlyDeployed(deployedAt?: string): {
  minutesAgo: number;
  timeAgo: string;
} {
  const [minutesAgo, setMinutesAgo] = useState(() => {
    if (!deployedAt) return Infinity;
    return (Date.now() - new Date(deployedAt).getTime()) / 60_000;
  });

  useEffect(() => {
    if (!deployedAt) return;
    const update = () =>
      setMinutesAgo((Date.now() - new Date(deployedAt).getTime()) / 60_000);
    update();
    const id = setInterval(update, 15_000);
    return () => clearInterval(id);
  }, [deployedAt]);

  const rounded = Math.floor(minutesAgo);
  const timeAgo = rounded < 1 ? "just now" : `${rounded}m ago`;

  return { minutesAgo, timeAgo };
}

const statusTheme: Partial<
  Record<ServiceState, { glow: string; ring: string; text: string }>
> = {
  pending: {
    glow: "bg-blue-400/60",
    ring: "ring-blue-400/20 dark:ring-blue-400/25",
    text: "text-blue-400/80",
  },
  degraded: {
    glow: "bg-orange-400/60",
    ring: "ring-orange-400/20 dark:ring-orange-400/25",
    text: "text-orange-400/80",
  },
  failed: {
    glow: "bg-rose-400/60",
    ring: "ring-rose-400/20 dark:ring-rose-400/25",
    text: "text-rose-400/80",
  },
  unknown: {
    glow: "bg-purple-400/60",
    ring: "ring-purple-400/20 dark:ring-purple-400/25",
    text: "text-purple-400/80",
  },
  terminating: {
    glow: "bg-zinc-400/40",
    ring: "ring-zinc-400/20 dark:ring-zinc-400/25",
    text: "text-zinc-400/80",
  },
};

export function ServiceNodeCard({
  label,
  image,
  status,
  deployedAt,
  onClick,
  onHover,
}: ServiceNodeData) {
  const theme = statusTheme[status.state];
  const { minutesAgo, timeAgo } = useRecentlyDeployed(deployedAt);
  const recentlyDeployed =
    status.state === "running" && minutesAgo < RECENTLY_DEPLOYED_MINUTES;
  const recentOpacity = recentlyDeployed
    ? 1 - minutesAgo / RECENTLY_DEPLOYED_MINUTES
    : 0;

  const tag = getImageTag(image);
  const isDeploying = status.state === "pending";
  const isStopped = status.state === "stopped";
  // Transient states where the cluster is actively converging — surface a
  // spinner so the node reads as "working", not just a static color.
  const isProgressing =
    status.state === "pending" || status.state === "terminating";

  return (
    <div className={cn("relative w-56 h-20", isStopped && "opacity-50")}>
      {/* Status glow */}
      {theme && (
        <div
          className={cn(
            "absolute inset-0 rounded-lg blur-[2px] animate-[glow-pulse_3s_ease-in-out_infinite]",
            theme.glow,
          )}
        />
      )}

      {/* Recently deployed glow */}
      {recentlyDeployed && (
        <div
          className="absolute inset-0 rounded-lg blur-[2px] bg-emerald-400/40"
          style={{ opacity: recentOpacity }}
        />
      )}

      <div
        role="button"
        tabIndex={0}
        className={cn(
          "relative w-full h-full rounded-lg bg-card cursor-pointer transition-all",
          theme
            ? cn("ring-2", theme.ring)
            : recentlyDeployed
              ? "ring-1 ring-emerald-400/20 shadow-sm hover:shadow-md"
              : "ring-1 ring-foreground/[0.08] dark:ring-white/[0.1] shadow-sm hover:shadow-md",
        )}
        data-testid="service.node"
        data-name={label}
        onClick={onClick}
        onMouseEnter={onHover}
        onFocus={onHover}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
          }
        }}
      >
        <div className="p-3 space-y-1">
          <div className="flex items-center gap-2">
            <div className="shrink-0 text-foreground/80">
              <ServiceIcon image={image} />
            </div>
            <p className="text-sm font-medium truncate">{label}</p>
            {isProgressing && (
              <Spinner
                className={cn(
                  "size-3.5 ml-auto shrink-0",
                  theme?.text ?? "text-muted-foreground",
                )}
              />
            )}
          </div>

          {/* Subtitle: message takes priority, then image tag for deploy/recent */}
          {status.message ? (
            <p
              className={cn(
                "text-[11px] truncate pl-5.5",
                theme?.text ?? "text-muted-foreground",
              )}
            >
              {status.message}
            </p>
          ) : recentlyDeployed ? (
            <p
              className="text-[11px] truncate pl-5.5 text-emerald-500/80"
              style={{ opacity: recentOpacity }}
            >
              Deployed {tag ? `${tag} ` : ""}
              {timeAgo}
            </p>
          ) : isDeploying && tag ? (
            <p className="text-[11px] truncate pl-5.5 text-blue-400/80">
              {tag}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ServiceNode({ data }: NodeProps) {
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!size-0 !border-0 !bg-transparent"
      />
      <ServiceNodeCard {...(data as unknown as ServiceNodeData)} />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-0 !border-0 !bg-transparent"
      />
    </>
  );
}
