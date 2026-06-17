import { SiPostgresql, SiRedis } from "@icons-pack/react-simple-icons";
import type React from "react";

export interface ComponentOutput {
  key: string;
  secret: boolean;
}

export interface ComponentDefinition {
  type: string;
  name: string;
  category: string;
  icon: React.FC<{ className?: string }>;
  outputs: ComponentOutput[];
  // available = implemented + selectable. Others render as "coming soon".
  available?: boolean;
}

export const componentDefinitions: ComponentDefinition[] = [
  {
    type: "postgres",
    name: "Postgres",
    category: "Databases",
    available: true,
    icon: SiPostgresql,
    outputs: [
      { key: "DATABASE_URL", secret: false },
      { key: "PGHOST", secret: false },
      { key: "PGPORT", secret: false },
      { key: "PGUSER", secret: false },
      { key: "PGPASSWORD", secret: true },
      { key: "PGDATABASE", secret: false },
    ],
  },
  {
    type: "redis",
    name: "Redis",
    category: "Databases",
    available: true,
    icon: SiRedis,
    outputs: [
      { key: "REDIS_URL", secret: false },
      { key: "REDIS_HOST", secret: false },
      { key: "REDIS_PORT", secret: false },
      { key: "REDIS_PASSWORD", secret: true },
    ],
  },
];
