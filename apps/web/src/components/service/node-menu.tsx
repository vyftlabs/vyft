import {
  ActivityIcon,
  PanelRightOpenIcon,
  RocketIcon,
  ScrollTextIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function NodeContextMenu({
  x,
  y,
  onOpen,
  onOpenTab,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  onOpen: () => void;
  // onOpenTab opens the drawer straight to a specific tab.
  onOpenTab: (tab: "logs" | "metrics" | "deployments") => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - 220);

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-50 w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      <MenuItem onClick={onOpen} testId="service.node-menu.open">
        <PanelRightOpenIcon className="size-3.5" />
        Open
      </MenuItem>
      <MenuItem
        onClick={() => onOpenTab("logs")}
        testId="service.node-menu.logs"
      >
        <ScrollTextIcon className="size-3.5" />
        Logs
      </MenuItem>
      <MenuItem
        onClick={() => onOpenTab("metrics")}
        testId="service.node-menu.metrics"
      >
        <ActivityIcon className="size-3.5" />
        Metrics
      </MenuItem>
      <MenuItem
        onClick={() => onOpenTab("deployments")}
        testId="service.node-menu.deployments"
      >
        <RocketIcon className="size-3.5" />
        Deployments
      </MenuItem>
      <div className="my-1 h-px bg-border" />
      <MenuItem
        onClick={onDelete}
        variant="danger"
        testId="service.node-menu.delete"
      >
        <Trash2Icon className="size-3.5" />
        Delete
      </MenuItem>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  variant,
  testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "danger";
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent",
        variant === "danger" && "text-destructive hover:bg-destructive/10",
      )}
    >
      {children}
    </button>
  );
}
