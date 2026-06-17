import { useQuery } from "@tanstack/react-query";
import type { LogLine } from "@vyft/spec";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 2_000;

// CloudNativePG emits structured JSON logs: a top-level
// {level, ts, logger, msg, record} envelope. For logger="postgres" the real
// Postgres line lives in `record` (.error_severity + .message); other loggers
// (instance-manager) carry it in top-level `msg`/`level`. parseCnpg pulls the
// human message + severity out so we render that instead of raw JSON. Returns
// null for anything that isn't this shape (e.g. plain app logs) → shown as-is.
interface ParsedLog {
  severity?: string;
  text: string;
}

function parseCnpg(raw: string): ParsedLog | null {
  if (raw.charCodeAt(0) !== 123 /* { */) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const obj = o as Record<string, unknown>;
  const rec = obj.record;
  if (obj.logger === "postgres" && rec && typeof rec === "object") {
    const r = rec as Record<string, unknown>;
    if (typeof r.message === "string") {
      return {
        severity:
          typeof r.error_severity === "string" ? r.error_severity : undefined,
        text: r.message,
      };
    }
  }
  if (typeof obj.msg === "string") {
    return {
      severity: typeof obj.level === "string" ? obj.level : undefined,
      text: obj.msg,
    };
  }
  return null;
}

// Only attention-worthy severities get color; routine LOG/INFO/DEBUG stay
// in the default foreground so problems stand out.
const severityClass: Record<string, string> = {
  ERROR: "text-severity-critical-text",
  FATAL: "text-severity-critical-text",
  PANIC: "text-severity-critical-text",
  WARN: "text-severity-warning-text",
  WARNING: "text-severity-warning-text",
};

function isUnreachable(err: unknown): boolean {
  return err instanceof ApiError && err.code === "INTERNAL";
}

export function LogsPanel({
  projectId,
  resourceId,
  deploymentId,
  live = true,
}: {
  projectId: string;
  resourceId: string;
  // When set, logs are scoped to that deployment's rollout (its pods).
  deploymentId?: string;
  // When false, fetch once without polling — for a finished deployment whose
  // pods no longer produce new lines.
  live?: boolean;
}) {
  const cap = useQuery({
    ...api.observability.logsCapabilities(projectId, resourceId),
    enabled: !!projectId && !!resourceId,
  });

  const sk = cap.data?.sourceKind ?? null;
  const enabled = !!sk && cap.data?.detected.includes("tail");

  const tail = useQuery({
    ...api.observability.logsTail(projectId, resourceId, deploymentId),
    enabled,
    refetchInterval: live ? POLL_INTERVAL_MS : false,
  });

  if (cap.isError && isUnreachable(cap.error)) {
    return <Header><Status text="Logs source unreachable." cta /></Header>;
  }
  if (!sk) {
    return <Header><Status text="No logs source configured." cta /></Header>;
  }
  if (tail.isLoading) {
    return (
      <Header>
        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
          Loading...
        </div>
      </Header>
    );
  }
  if (tail.isError) {
    return (
      <Header>
        <Status text={tail.error?.message ?? "Logs query failed."} />
      </Header>
    );
  }
  const lines = (tail.data ?? []) as LogLine[];
  if (lines.length === 0) {
    return (
      <Header>
        <Status text="No recent log lines." />
      </Header>
    );
  }

  return (
    <Header>
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
  sub,
  children,
}: {
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full min-h-0 flex flex-col">
      {sub && (
        <div className="mb-2 shrink-0 flex items-baseline justify-end">
          <p className="text-[10px] text-muted-foreground">{sub}</p>
        </div>
      )}
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
  const parsed = parseCnpg(line.message);
  const text = parsed?.text ?? line.message;
  const sevClass = parsed?.severity
    ? severityClass[parsed.severity.toUpperCase()]
    : undefined;
  return (
    <div
      className={cn(
        "pr-1 hover:bg-muted/50 rounded-sm whitespace-pre-wrap break-words",
        sevClass ?? "text-foreground",
      )}
    >
      {text}
    </div>
  );
}
