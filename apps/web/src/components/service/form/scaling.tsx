import type { ResourceAppCreate } from "@vyft/spec";
import { MinusIcon, PlusIcon } from "lucide-react";
import { type Control, Controller } from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Slider } from "@/components/ui/slider";

const cpuSteps = [
  0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5,
  3, 3.5, 4, 5, 6, 7, 8,
];

const memSteps = [
  64, 128, 192, 256, 320, 384, 448, 512, 640, 768, 896, 1024, 1280, 1536, 1792,
  2048, 2560, 3072, 3584, 4096, 5120, 6144, 7168, 8192, 10240, 12288, 14336,
  16384,
];

function formatCpuDisplay(cores: number): string {
  if (cores >= 1) {
    return `${Number.isInteger(cores) ? cores : cores.toFixed(2)} core${cores > 1 ? "s" : ""}`;
  }
  return `${Math.round(cores * 1000)}m`;
}

function formatMemDisplay(mb: number): string {
  const gib = mb / 1024;
  if (gib >= 1) return `${Number.isInteger(gib) ? gib : gib.toFixed(1)}Gi`;
  return `${mb}Mi`;
}

function closestIndex(steps: number[], value: number): number {
  let best = 0;
  for (let i = 0; i < steps.length; i++) {
    if (
      Math.abs((steps[i] ?? 0) - value) < Math.abs((steps[best] ?? 0) - value)
    )
      best = i;
  }
  return best;
}

function ResourceStep({
  label,
  value,
  onChange,
  steps,
  formatDisplay,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  steps: number[];
  formatDisplay: (v: number) => string;
}) {
  const idx = closestIndex(steps, value);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <span className="text-sm text-muted-foreground font-mono">
          {formatDisplay(value)}
        </span>
      </div>
      <Slider
        value={[idx]}
        onValueChange={([next]) => {
          if (next !== undefined && steps[next] !== undefined)
            onChange(steps[next]);
        }}
        min={0}
        max={steps.length - 1}
        step={1}
      />
    </div>
  );
}

export function ScalingForm({
  control,
  showInstances = true,
}: {
  control: Control<ResourceAppCreate>;
  showInstances?: boolean;
}) {
  return (
    <div className="space-y-3">
      {showInstances && (
        <Controller
          name="config.spec.instances"
          control={control}
          render={({ field, fieldState }) => {
            const value = Number.isFinite(field.value) ? field.value : 1;
            return (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Instances</FieldLabel>
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <InputGroupButton
                      size="icon-xs"
                      disabled={value <= 1}
                      onClick={() => field.onChange(Math.max(1, value - 1))}
                    >
                      <MinusIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                  <InputGroupInput
                    id={field.name}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    type="number"
                    min="1"
                    value={Number.isFinite(field.value) ? field.value : ""}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    data-testid="service.form.instances"
                    className="text-center font-mono [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      onClick={() => field.onChange(value + 1)}
                    >
                      <PlusIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldError errors={[fieldState.error]} />
              </Field>
            );
          }}
        />
      )}

      <div className="grid grid-cols-2 gap-6">
        <Controller
          name="config.spec.resources.cpu"
          control={control}
          render={({ field }) => (
            <ResourceStep
              label="CPU"
              value={field.value}
              onChange={field.onChange}
              steps={cpuSteps}
              formatDisplay={formatCpuDisplay}
            />
          )}
        />

        <Controller
          name="config.spec.resources.memory"
          control={control}
          render={({ field }) => (
            <ResourceStep
              label="Memory"
              value={field.value}
              onChange={field.onChange}
              steps={memSteps}
              formatDisplay={formatMemDisplay}
            />
          )}
        />
      </div>
    </div>
  );
}
