import {
  ActivityIcon,
  BellIcon,
  FlameIcon,
  ScrollTextIcon,
  SirenIcon,
} from "lucide-react";
import type React from "react";

export type IntegrationCapability = "metrics" | "logs" | "alerts";

export type IntegrationFieldType = "text" | "password" | "url";

export interface IntegrationField {
  key: string;
  label: string;
  type: IntegrationFieldType;
  placeholder?: string;
  required?: boolean;
  mono?: boolean;
}

export interface IntegrationProvider {
  id: string;
  name: string;
  icon: React.FC<{ className?: string }>;
  capabilities: IntegrationCapability[];
  fields: IntegrationField[];
}

export interface IntegrationSlot {
  id: string;
  name: string;
  description: string;
  capability: IntegrationCapability;
  icon: React.FC<{ className?: string }>;
}

export interface IntegrationCategory {
  id: string;
  name: string;
  description: string;
  slots: IntegrationSlot[];
}

export const integrationProviders: IntegrationProvider[] = [
  {
    id: "prometheus",
    name: "Prometheus",
    icon: FlameIcon,
    capabilities: ["metrics"],
    fields: [
      {
        key: "url",
        label: "URL",
        type: "url",
        placeholder: "https://prometheus.example.com",
        required: true,
        mono: true,
      },
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
  },
  {
    id: "loki",
    name: "Loki",
    icon: ScrollTextIcon,
    capabilities: ["logs"],
    fields: [
      {
        key: "url",
        label: "URL",
        type: "url",
        placeholder: "https://loki.example.com",
        required: true,
        mono: true,
      },
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
  },
  {
    id: "alertmanager",
    name: "Alertmanager",
    icon: SirenIcon,
    capabilities: ["alerts"],
    fields: [
      {
        key: "url",
        label: "URL",
        type: "url",
        placeholder: "https://alertmanager.example.com",
        required: true,
        mono: true,
      },
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
  },
];

export const integrationCategories: IntegrationCategory[] = [
  {
    id: "observability",
    name: "Observability",
    description: "Connect external systems for metrics, logs, and alerts.",
    slots: [
      {
        id: "metrics",
        name: "Metrics",
        description: "Time-series data and dashboards.",
        capability: "metrics",
        icon: ActivityIcon,
      },
      {
        id: "logs",
        name: "Logs",
        description: "Application and infrastructure logs.",
        capability: "logs",
        icon: ScrollTextIcon,
      },
      {
        id: "alerts",
        name: "Alerts",
        description: "Alert routing and incident management.",
        capability: "alerts",
        icon: BellIcon,
      },
    ],
  },
];

export function providersForCapability(
  capability: IntegrationCapability,
): IntegrationProvider[] {
  return integrationProviders.filter((p) =>
    p.capabilities.includes(capability),
  );
}

export function getProvider(id: string): IntegrationProvider | undefined {
  return integrationProviders.find((p) => p.id === id);
}
