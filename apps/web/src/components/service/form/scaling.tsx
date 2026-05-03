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
import type { ScalingFormValues } from "./types";

const cpuSteps = [
  50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 750, 1000, 1250, 1500, 1750,
  2000, 2500, 3000, 3500, 4000, 5000, 6000, 7000, 8000,
];

const memSteps = [
  64, 128, 192, 256, 320, 384, 448, 512, 640, 768, 896, 1024, 1280, 1536, 1792,
  2048, 2560, 3072, 3584, 4096, 5120, 6144, 7168, 8192, 10240, 12288, 14336,
  16384,
];

function parseCpu(v: string): number {
  if (!v) return 0;
  // Always store as millicores internally
  if (v.endsWith("m")) return parseInt(v, 10) || 0;
  // Bare number = could be cores (from formatCpu) or millicores
  const n = parseFloat(v);
  if (Number.isNaN(n)) return 0;
  // If it looks like cores (small number without 'm'), convert to millicores
  return n < 50 ? n * 1000 : n;
}

function parseMem(v: string): number {
  if (!v) return 0;
  if (v.endsWith("Gi")) return (parseFloat(v) || 0) * 1024;
  if (v.endsWith("Mi")) return parseInt(v, 10) || 0;
  return parseInt(v, 10) || 0;
}

function formatCpu(v: number): string {
  if (v === 0) return "";
  return `${v}m`;
}

function formatCpuDisplay(v: number): string {
  if (v >= 1000) return `${v / 1000} core${v > 1000 ? "s" : ""}`;
  return `${v}m`;
}

function formatMem(v: number): string {
  if (v === 0) return "";
  return `${v}Mi`;
}

function formatMemDisplay(v: number): string {
  if (v >= 1024) return `${(v / 1024).toFixed(v % 1024 === 0 ? 0 : 1)}Gi`;
  return `${v}Mi`;
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

function ResourceRange({
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  steps,
  format,
  formatDisplay,
  parse,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  steps: number[];
  format: (v: number) => string;
  formatDisplay: (v: number) => string;
  parse: (v: string) => number;
}) {
  const minNum = parse(minValue);
  const maxNum = parse(maxValue);
  const minIdx = closestIndex(steps, minNum);
  const maxIdx = closestIndex(steps, maxNum);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <span className="text-sm text-muted-foreground font-mono">
          {formatDisplay(minNum)} – {formatDisplay(maxNum)}
        </span>
      </div>
      <Slider
        value={[minIdx, maxIdx]}
        onValueChange={([lo, hi]) => {
          if (lo !== undefined && steps[lo] !== undefined)
            onMinChange(format(steps[lo]));
          if (hi !== undefined && steps[hi] !== undefined)
            onMaxChange(format(steps[hi]));
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
  showReplicas = true,
}: {
  control: Control<ScalingFormValues>;
  showReplicas?: boolean;
}) {
  return (
    <div className="space-y-3">
      {showReplicas && (
        <Controller
          name="replicas"
          control={control}
          rules={{ required: "Replicas is required" }}
          render={({ field, fieldState }) => {
            const value = parseInt(field.value, 10) || 1;
            return (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Replicas</FieldLabel>
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <InputGroupButton
                      size="icon-xs"
                      disabled={value <= 1}
                      onClick={() =>
                        field.onChange(String(Math.max(1, value - 1)))
                      }
                    >
                      <MinusIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                  <InputGroupInput
                    {...field}
                    id={field.name}
                    type="number"
                    min="1"
                    className="text-center font-mono [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      onClick={() => field.onChange(String(value + 1))}
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
          name="cpuRequest"
          control={control}
          render={({ field: reqField }) => (
            <Controller
              name="cpuLimit"
              control={control}
              render={({ field: limField }) => (
                <ResourceRange
                  label="CPU"
                  minValue={reqField.value}
                  maxValue={limField.value}
                  onMinChange={reqField.onChange}
                  onMaxChange={limField.onChange}
                  steps={cpuSteps}
                  format={formatCpu}
                  formatDisplay={formatCpuDisplay}
                  parse={parseCpu}
                />
              )}
            />
          )}
        />

        <Controller
          name="memoryRequest"
          control={control}
          render={({ field: reqField }) => (
            <Controller
              name="memoryLimit"
              control={control}
              render={({ field: limField }) => (
                <ResourceRange
                  label="Memory"
                  minValue={reqField.value}
                  maxValue={limField.value}
                  onMinChange={reqField.onChange}
                  onMaxChange={limField.onChange}
                  steps={memSteps}
                  format={formatMem}
                  formatDisplay={formatMemDisplay}
                  parse={parseMem}
                />
              )}
            />
          )}
        />
      </div>
    </div>
  );
}
