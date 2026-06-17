import { useMutation, useQuery } from "@tanstack/react-query";
import type { Backup } from "@vyft/spec";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import * as api from "@/lib/api";
import { getPostgresSpec } from "@/lib/resource";
import { cn } from "@/lib/utils";
import { BackupConfigDialog } from "./backup-config-dialog";
import { timeAgo } from "./timeline";

// phaseInfo maps CNPG Backup phases to a label + tone. Completed is neutral;
// color is reserved for in-progress (info) and failure (critical).
function phaseInfo(phase: string): { label: string; tone?: "info" | "error" } {
  const p = phase.toLowerCase();
  if (p === "completed") return { label: "Completed" };
  if (p.includes("fail") || p === "error") return { label: phase, tone: "error" };
  if (p === "") return { label: "Pending", tone: "info" };
  return { label: phase, tone: "info" }; // running / starting / walArchiving …
}

export function BackupsTab({
  projectId,
  resourceId,
}: {
  projectId: string;
  resourceId: string;
}) {
  const { data: resource } = useQuery(api.resources.byId(projectId, resourceId));
  const { data: backups = [] } = useQuery(api.backups.list(projectId, resourceId));
  const [configOpen, setConfigOpen] = useState(false);

  const backUp = useMutation({
    ...api.backups.create,
    onSuccess: () => toast.success("Backup started."),
    onError: (e: Error) => toast.error(e.message),
  });

  const backupCfg = resource ? getPostgresSpec(resource)?.backup : undefined;
  const configured = !!backupCfg;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 pb-3">
        {configured ? (
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            <span className="font-mono">{backupCfg.schedule}</span> ·{" "}
            {backupCfg.retentionDays}d retention
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            No backup schedule configured.
          </p>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            data-testid="service.backups.configure"
            onClick={() => setConfigOpen(true)}
          >
            Configure
          </Button>
          {configured && (
            <Button
              size="sm"
              data-testid="service.backups.run"
              disabled={backUp.isPending}
              onClick={() => backUp.mutate({ projectId, resourceId })}
            >
              {backUp.isPending && <Spinner className="size-3.5" />}
              Back up now
            </Button>
          )}
        </div>
      </div>

      {backups.length === 0 ? (
        <p className="py-4 text-xs text-muted-foreground">
          {configured
            ? "No backups yet — run one now."
            : "Configure backups to get started."}
        </p>
      ) : (
        <ScrollArea className="-mr-6 min-h-0 flex-1">
          <div className="divide-y pr-6 [&>*:first-child]:pt-0">
            {backups.map((b: Backup) => {
              const info = phaseInfo(b.phase);
              const running =
                info.tone === "info" && b.phase.toLowerCase() !== "";
              return (
                <div key={b.name} className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {running && (
                        <Spinner className="size-3 text-severity-info" />
                      )}
                      <span
                        data-testid="service.backups.phase"
                        className={cn(
                          "text-sm font-medium",
                          info.tone === "error" &&
                            "text-severity-critical-text",
                          info.tone === "info" && "text-severity-info",
                        )}
                      >
                        {info.label}
                      </span>
                      {b.backupId && (
                        <span className="font-mono text-[10px] text-muted-foreground/60">
                          {b.backupId}
                        </span>
                      )}
                    </div>
                    {b.error && (
                      <p className="mt-0.5 text-[11px] leading-snug text-severity-critical-text">
                        {b.error}
                      </p>
                    )}
                  </div>
                  {b.startedAt && (
                    <span
                      className="shrink-0 text-xs tabular-nums text-muted-foreground"
                      title={new Date(b.startedAt).toLocaleString()}
                    >
                      {timeAgo(b.startedAt)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {resource && (
        <BackupConfigDialog
          resource={resource}
          projectId={projectId}
          open={configOpen}
          onOpenChange={setConfigOpen}
        />
      )}
    </div>
  );
}
