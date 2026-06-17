import { useQuery } from "@tanstack/react-query";
import type { LogLine, LogLevel } from "@vyft/spec";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 2_000;

const levelClass: Record<LogLevel, string> = {
  error: "text-severity-critical-text",
  warn: "text-severity-warning-text",
  info: "text-foreground",
  debug: "text-muted-foreground",
  unknown: "text-muted-foreground",
};

function isUnreachable(err: unknown): boolean {
  return err instanceof ApiError && err.code === "INTERNAL";
}

export function LogsPanel({
  projectId,
  resourceId,
}: {
  projectId: string;
  resourceId: string;
}) {
  const cap = useQuery({
    ...api.observability.logsCapabilities(projectId, resourceId),
    enabled: !!projectId && !!resourceId,
  });

  const sk = cap.data?.sourceKind ?? null;
  const enabled = !!sk && cap.data?.detected.includes("tail");

  const tail = useQuery({
    ...api.observability.logsTail(projectId, resourceId),
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
  });

  if (cap.isError && isUnreachable(cap.error)) {
    return <Header label="Logs"><Status text="Logs source unreachable." cta /></Header>;
  }
  if (!sk) {
    return <Header label="Logs"><Status text="No logs source configured." cta /></Header>;
  }
  if (tail.isLoading) {
    return (
      <Header label="Logs">
        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
          Loading...
        </div>
      </Header>
    );
  }
  if (tail.isError) {
    return (
      <Header label="Logs">
        <Status text={tail.error?.message ?? "Logs query failed."} />
      </Header>
    );
  }
  const lines = (tail.data ?? []) as LogLine[];
  if (lines.length === 0) {
    return (
      <Header label="Logs">
        <Status text="No recent log lines." />
      </Header>
    );
  }

  return (
    <Header label="Logs">
      <StickyScroll lines={lines} />
    </Header>
  );
}

// StickyScroll keeps the viewport pinned to the bottom while the user is
// at-bottom, so new lines slide in like `kubectl logs -f`. If the user
// scrolls up to read history, auto-stick pauses; it resumes when they
// scroll back to within `STICK_THRESHOLD` pixels of the bottom.
const STICK_THRESHOLD = 24;

function StickyScroll({ lines }: { lines: LogLine[] }) {
  // ScrollArea wraps base-ui; its scrollable element is the inner
  // [data-slot="scroll-area-viewport"]. Resolve once via the Root ref.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(true);

  function viewport(): HTMLElement | null {
    return (
      rootRef.current?.querySelector<HTMLElement>(
        "[data-slot=scroll-area-viewport]",
      ) ?? null
    );
  }

  useEffect(() => {
    if (!stuck) return;
    const el = viewport();
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length, stuck]);

  // Subscribe to the viewport's scroll events. ScrollArea doesn't expose
  // an onScroll prop, so attach via the resolved viewport.
  useEffect(() => {
    const el = viewport();
    if (!el) return;
    const onScroll = () => {
      const atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
      setStuck(atBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <ScrollArea ref={rootRef} className="h-full -mr-4">
      <div className="pr-4 font-mono text-[11px] leading-relaxed space-y-px">
        {lines.map((l, i) => (
          <Row key={`${l.timestamp}-${i}`} line={l} />
        ))}
      </div>
    </ScrollArea>
  );
}

function Header({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="mb-2 shrink-0 flex items-baseline justify-between">
        <p className="text-xs font-medium">{label}</p>
        {sub && (
          <p className="text-[10px] text-muted-foreground">{sub}</p>
        )}
      </div>
      <div className="flex-1 min-h-0 relative">{children}</div>
    </div>
  );
}

function Status({ text, cta }: { text: string; cta?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center gap-2 h-full text-xs text-muted-foreground">
      <span>{text}</span>
      {cta && (
        <Button
          size="xs"
          variant="outline"
          onClick={() => navigate("/settings/sources")}
        >
          Configure logs
        </Button>
      )}
    </div>
  );
}

function Row({ line }: { line: LogLine }) {
  const ts = new Date(line.timestamp);
  return (
    <div className="flex gap-2 px-1 hover:bg-muted/50 rounded-sm">
      <span className="text-muted-foreground shrink-0">
        {ts.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })}
      </span>
      <span
        className={cn(
          "shrink-0 w-10 uppercase",
          levelClass[line.level],
        )}
      >
        {line.level}
      </span>
      <span className="text-foreground truncate">{line.message}</span>
    </div>
  );
}
