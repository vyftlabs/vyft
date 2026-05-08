import { HealthCheck } from "@vyft/spec";
import { type Control, Controller } from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ServiceFormValues } from "./schema";

type HealthCheckType = HealthCheck["type"];

function HealthEditor({
  value,
  onChange,
}: {
  value: HealthCheck;
  onChange: (next: HealthCheck) => void;
}) {
  const updateHttp = (patch: { path?: string; port?: number | undefined }) => {
    if (value.type !== "http") return;
    onChange({ ...value, ...patch });
  };
  const updateTcp = (port: number) => {
    onChange({ type: "tcp", port });
  };
  const updateCommand = (command: string) => {
    onChange({ type: "command", command });
  };

  const portValueAsNumber = (e: React.ChangeEvent<HTMLInputElement>) =>
    e.target.valueAsNumber;

  return (
    <div className="space-y-3">
      <Field>
        <FieldLabel>Type</FieldLabel>
        <Select
          value={value.type}
          onValueChange={(v) =>
            onChange(HealthCheck.parse({ type: v as HealthCheckType }))
          }
        >
          <SelectTrigger
            className="w-full"
            data-testid="service.form.health.type"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value="none"
              data-testid="service.form.health.type.none"
            >
              None
            </SelectItem>
            <SelectItem
              value="http"
              data-testid="service.form.health.type.http"
            >
              HTTP
            </SelectItem>
            <SelectItem value="tcp" data-testid="service.form.health.type.tcp">
              TCP
            </SelectItem>
            <SelectItem
              value="command"
              data-testid="service.form.health.type.command"
            >
              Command
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {value.type === "http" && (
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="health-http-path">Path</FieldLabel>
            <Input
              id="health-http-path"
              value={value.path}
              onChange={(e) => updateHttp({ path: e.target.value })}
              placeholder="/health"
              className="font-mono"
              data-testid="service.form.health.path"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="health-http-port">Port</FieldLabel>
            <Input
              id="health-http-port"
              type="number"
              value={value.port ?? ""}
              onChange={(e) => {
                const n = portValueAsNumber(e);
                updateHttp({ port: Number.isFinite(n) ? n : undefined });
              }}
              placeholder="8080"
              data-testid="service.form.health.port"
            />
          </Field>
        </div>
      )}

      {value.type === "tcp" && (
        <Field>
          <FieldLabel htmlFor="health-tcp-port">Port</FieldLabel>
          <Input
            id="health-tcp-port"
            type="number"
            value={Number.isFinite(value.port) ? value.port : ""}
            onChange={(e) => updateTcp(portValueAsNumber(e))}
            placeholder="8080"
            data-testid="service.form.health.port"
          />
        </Field>
      )}

      {value.type === "command" && (
        <Field>
          <FieldLabel htmlFor="health-command">Command</FieldLabel>
          <Input
            id="health-command"
            value={value.command}
            onChange={(e) => updateCommand(e.target.value)}
            placeholder="curl -f http://localhost:8080/health"
            className="font-mono"
            data-testid="service.form.health.command"
          />
        </Field>
      )}
    </div>
  );
}

export function HealthForm({
  control,
}: {
  control: Control<ServiceFormValues>;
}) {
  return (
    <Controller
      name="healthCheck"
      control={control}
      render={({ field, fieldState }) => (
        <div className="space-y-2">
          <HealthEditor value={field.value} onChange={field.onChange} />
          {fieldState.error && <FieldError errors={[fieldState.error]} />}
        </div>
      )}
    />
  );
}
