import {
  ChartLineIcon,
  DatabaseIcon,
  ScrollTextIcon,
  ServerIcon,
} from "lucide-react";
import type React from "react";
import type { SourceDomain, SourceKind } from "@vyft/spec";

export interface SourcePreset {
  id: SourceKind;
  domain: SourceDomain;
  name: string;
  blurb: string;
  icon: React.FC<{ className?: string }>;
}

export const sourcePresets: SourcePreset[] = [
  {
    id: "prometheus",
    domain: "metrics",
    name: "Prometheus",
    blurb: "CPU, Memory, Request rate, Error rate, Latency.",
    icon: ChartLineIcon,
  },
  {
    id: "metricsServer",
    domain: "metrics",
    name: "metrics-server",
    blurb: "CPU and Memory only. Built into the cluster.",
    icon: DatabaseIcon,
  },
  {
    id: "loki",
    domain: "logs",
    name: "Loki",
    blurb: "Streaming + range search via LogQL.",
    icon: ScrollTextIcon,
  },
  {
    id: "kubeLogs",
    domain: "logs",
    name: "Kubernetes",
    blurb: "Built-in pod logs; tail only.",
    icon: ServerIcon,
  },
];
