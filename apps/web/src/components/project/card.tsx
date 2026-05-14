import {
  Background,
  BackgroundVariant,
  type Node,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BoxIcon } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

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

function MiniIcon({ image }: { image?: string }) {
  const slug = getIconSlug(image);
  if (!slug) return <BoxIcon className="size-3" />;
  const url = `https://cdn.simpleicons.org/${slug}`;
  return (
    <div
      className="size-3 bg-foreground/60"
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

export interface ProjectServiceSummary {
  id: string;
  name: string;
  image?: string;
  status: string;
}

type ServiceStatus = "running" | "pending" | "degraded" | "failed";

export interface ProjectCardProps {
  name: string;
  services?: ProjectServiceSummary[];
  href?: string;
  onClick?: () => void;
}

const statusBg: Record<ServiceStatus, string> = {
  running: "bg-card",
  pending: "bg-severity-info/5",
  degraded: "bg-severity-warning/5",
  failed: "bg-severity-critical/5",
};

const statusRing: Record<ServiceStatus, string> = {
  running: "ring-foreground/[0.06]",
  pending: "ring-severity-info/30",
  degraded: "ring-severity-warning/30",
  failed: "ring-severity-critical/30",
};

function MiniNode({
  data,
}: {
  data: { label: string; status: ServiceStatus; image?: string };
}) {
  const hasIssue = data.status !== "running";
  return (
    <div
      className={cn(
        "rounded-md bg-card px-2.5 py-1.5 shadow-sm flex items-center gap-1.5 ring-1",
        statusRing[data.status],
        hasIssue && statusBg[data.status],
      )}
    >
      <MiniIcon image={data.image} />
      <span className="text-[8px] font-medium text-foreground/70 truncate">
        {data.label}
      </span>
    </div>
  );
}

const nodeTypes = { mini: MiniNode };

const COLS = 3;
const X_GAP = 100;
const Y_GAP = 40;

export function MiniCanvas({
  services,
  className,
}: {
  services: ProjectServiceSummary[];
  className?: string;
}) {
  const nodes: Node[] = services.map((svc, i) => ({
    id: svc.id,
    position: { x: (i % COLS) * X_GAP, y: Math.floor(i / COLS) * Y_GAP },
    data: {
      label: svc.name,
      status: svc.status as ServiceStatus,
      image: svc.image,
    },
    type: "mini",
    draggable: false,
    selectable: false,
    connectable: false,
  }));

  return (
    <div className={cn("overflow-hidden h-28", className)}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.4, maxZoom: 1.5, minZoom: 1.5 }}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnScroll={false}
        panOnDrag={false}
        preventScrolling={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={0.5} />
      </ReactFlow>
    </div>
  );
}

export type ProjectStatus = "healthy" | "pending" | "degraded" | "failed";

const statusBorderClass: Record<ProjectStatus, string> = {
  healthy: "border",
  pending: "border border-severity-info/30",
  degraded: "border border-severity-warning/30",
  failed: "border border-severity-critical/30",
};

const statusBadgeClass: Record<ProjectStatus, string> = {
  healthy: "",
  pending: "bg-severity-info/10 text-severity-info",
  degraded: "bg-severity-warning/10 text-severity-warning-text",
  failed: "bg-severity-critical/10 text-severity-critical-text",
};

export interface ProjectCardProps {
  name: string;
  slug?: string;
  status?: ProjectStatus;
  statusMessage?: string;
  services?: ProjectServiceSummary[];
  href?: string;
  onClick?: () => void;
}

export function ProjectCard({
  name,
  slug,
  status,
  statusMessage,
  services = [],
  href,
  onClick,
}: ProjectCardProps) {
  const shellClass = cn(
    "block rounded-lg bg-card overflow-hidden hover:shadow-md transition-shadow cursor-pointer",
    status ? statusBorderClass[status] : "border",
  );
  const inner = (
    <>
      {services.length > 0 ? (
        <MiniCanvas
          services={services}
          className="border-b border-foreground/[0.04]"
        />
      ) : (
        <div className="h-28 border-b border-foreground/[0.04] flex items-center justify-center">
          <p className="text-[10px] text-muted-foreground">No services</p>
        </div>
      )}
      <div className="p-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold truncate">{name}</p>
        {status && status !== "healthy" && statusMessage && (
          <span
            className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0",
              statusBadgeClass[status],
            )}
          >
            {statusMessage}
          </span>
        )}
      </div>
    </>
  );
  if (href) {
    return (
      <Link
        to={href}
        className={shellClass}
        data-testid="project-card"
        data-slug={slug}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={shellClass}
      onClick={onClick}
      data-testid="project-card"
      data-slug={slug}
    >
      {inner}
    </button>
  );
}
