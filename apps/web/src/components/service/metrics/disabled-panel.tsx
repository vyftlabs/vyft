import { useNavigate } from "react-router";
import type { SourceKind } from "@vyft/spec";
import { Button } from "@/components/ui/button";

export type DisabledCause = "none" | "ceiling" | "unreachable";

const KIND_LABELS: Record<string, string> = {
  cpu: "CPU",
  memory: "Memory",
  reqRate: "Request rate",
  errRate: "Error rate",
  latency: "Latency",
};

const SOURCE_LABELS: Record<SourceKind, string> = {
  prometheus: "Prometheus",
  metricsServer: "metrics-server",
};

function message(
  cause: DisabledCause,
  kind: string,
  sourceKind?: SourceKind,
): string {
  switch (cause) {
    case "none":
      return "No metrics source configured.";
    case "ceiling":
      return `${SOURCE_LABELS[sourceKind ?? "prometheus"]} doesn't support ${KIND_LABELS[kind] ?? kind}.`;
    case "unreachable":
      return "Metrics source unreachable.";
  }
}

export function DisabledPanel({
  cause,
  kind,
  sourceKind,
}: {
  cause: DisabledCause;
  kind: string;
  sourceKind?: SourceKind;
}) {
  const navigate = useNavigate();
  return (
    <div className="p-3 bg-muted/40 rounded-md flex flex-col gap-1">
      <p className="text-[11px] text-muted-foreground">
        {KIND_LABELS[kind] ?? kind}
      </p>
      <p className="text-xs text-muted-foreground flex-1">
        {message(cause, kind, sourceKind)}
      </p>
      <Button
        size="xs"
        variant="outline"
        className="self-start mt-1"
        onClick={() => navigate("/settings/sources")}
      >
        Configure metrics
      </Button>
    </div>
  );
}
