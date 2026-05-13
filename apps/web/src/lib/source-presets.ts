import { ChartLineIcon, DatabaseIcon } from "lucide-react";
import type React from "react";
import type { SourceKind } from "@vyft/spec";

export interface SourcePreset {
  id: SourceKind;
  name: string;
  blurb: string;
  icon: React.FC<{ className?: string }>;
}

export const sourcePresets: SourcePreset[] = [
  {
    id: "prometheus",
    name: "Prometheus",
    blurb: "CPU, Memory, Request rate, Error rate, Latency.",
    icon: ChartLineIcon,
  },
  {
    id: "metricsServer",
    name: "metrics-server",
    blurb: "CPU and Memory only. Built into the cluster.",
    icon: DatabaseIcon,
  },
];
