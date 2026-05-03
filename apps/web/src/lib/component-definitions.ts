import type React from "react"
import { SiPostgresql, SiRedis, SiMinio, SiRabbitmq, SiNatsdotio } from "@icons-pack/react-simple-icons"
import { ZapIcon } from "lucide-react"

export interface ComponentOutput {
  key: string
  secret: boolean
}

export interface ComponentDefinition {
  type: string
  name: string
  category: string
  icon: React.FC<{ className?: string }>
  outputs: ComponentOutput[]
}

export const componentDefinitions: ComponentDefinition[] = [
  {
    type: "postgres",
    name: "Postgres",
    category: "Databases",
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
    icon: SiRedis,
    outputs: [
      { key: "REDIS_URL", secret: false },
      { key: "REDIS_HOST", secret: false },
      { key: "REDIS_PORT", secret: false },
      { key: "REDIS_PASSWORD", secret: true },
    ],
  },
  {
    type: "dragonfly",
    name: "Dragonfly",
    category: "Databases",
    icon: ZapIcon,
    outputs: [
      { key: "REDIS_URL", secret: false },
      { key: "REDIS_HOST", secret: false },
      { key: "REDIS_PORT", secret: false },
      { key: "REDIS_PASSWORD", secret: true },
    ],
  },
  {
    type: "minio",
    name: "MinIO",
    category: "Storage",
    icon: SiMinio,
    outputs: [
      { key: "S3_ENDPOINT", secret: false },
      { key: "S3_ACCESS_KEY", secret: true },
      { key: "S3_SECRET_KEY", secret: true },
      { key: "S3_BUCKET", secret: false },
    ],
  },
  {
    type: "rabbitmq",
    name: "RabbitMQ",
    category: "Messaging",
    icon: SiRabbitmq,
    outputs: [
      { key: "RABBITMQ_URL", secret: false },
      { key: "RABBITMQ_HOST", secret: false },
      { key: "RABBITMQ_PORT", secret: false },
      { key: "RABBITMQ_USER", secret: false },
      { key: "RABBITMQ_PASSWORD", secret: true },
    ],
  },
  {
    type: "nats",
    name: "NATS",
    category: "Messaging",
    icon: SiNatsdotio,
    outputs: [
      { key: "NATS_URL", secret: false },
      { key: "NATS_HOST", secret: false },
      { key: "NATS_PORT", secret: false },
    ],
  },
]