export type EmptyCause = "service-not-instrumented" | "no-data-in-range";

const KIND_LABELS: Record<string, string> = {
  cpu: "CPU",
  memory: "Memory",
  reqRate: "Request rate",
  errRate: "Error rate",
  latency: "Latency",
};

function message(cause: EmptyCause): string {
  switch (cause) {
    case "service-not-instrumented":
      return "No data — service may not be instrumented.";
    case "no-data-in-range":
      return "No data in selected range.";
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
    <div className="p-3 bg-background border border-dashed border-muted-foreground/20 rounded-md flex flex-col gap-1">
      <p className="text-[11px] text-muted-foreground">
        {KIND_LABELS[kind] ?? kind}
      </p>
      <p className="text-xs text-muted-foreground flex-1 italic">
        {message(cause)}
      </p>
    </div>
  );
}
