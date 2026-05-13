import { useNavigate } from "react-router";
import type { SourceKind } from "@vyft/spec";
import { Button } from "@/components/ui/button";
import { MetricSlotChrome } from "./chrome";

export type DisabledCause = "none" | "ceiling" | "unreachable";

const KIND_LABELS: Record<string, string> = {
  cpu: "CPU",
  memory: "Memory",
  reqRate: "Requests",
  errRate: "Error rate",
  latency: "Latency",
};

const SOURCE_LABELS: Record<SourceKind, string> = {
  prometheus: "Prometheus",
  metricsServer: "metrics-server",
  loki: "Loki",
  kubeLogs: "Kubernetes",
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
    <MetricSlotChrome
      className="bg-muted/40"
      title={KIND_LABELS[kind] ?? kind}
      headline={
        <span className="text-xs font-normal font-sans text-muted-foreground line-clamp-1">
          {message(cause, kind, sourceKind)}
        </span>
      }
      body={
        <Button
          size="xs"
          variant="outline"
          onClick={() => navigate("/settings/sources")}
        >
          Configure metrics
        </Button>
      }
    />
  );
}
