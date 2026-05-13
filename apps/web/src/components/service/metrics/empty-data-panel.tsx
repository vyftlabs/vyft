import { MetricSlotChrome } from "./chrome";

export type EmptyCause = "service-not-instrumented" | "no-data-in-range";

const KIND_LABELS: Record<string, string> = {
  cpu: "CPU",
  memory: "Memory",
  reqRate: "Requests",
  errRate: "Error rate",
  latency: "Latency",
};

function message(cause: EmptyCause): string {
  switch (cause) {
    case "service-not-instrumented":
      return "Service not instrumented.";
    case "no-data-in-range":
      return "No data in range.";
  }
}

export function EmptyDataPanel({
  cause,
  kind,
}: {
  cause: EmptyCause;
  kind: string;
}) {
  return (
    <MetricSlotChrome
      className="border border-dashed border-muted-foreground/20"
      title={KIND_LABELS[kind] ?? kind}
      headline={
        <span className="text-sm font-normal font-sans italic text-muted-foreground line-clamp-1">
          {message(cause)}
        </span>
      }
      body={null}
    />
  );
}
