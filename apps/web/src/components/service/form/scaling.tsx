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
import type { ServiceFormValues } from "./schema";

const cpuSteps = [
  50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 750, 1000, 1250, 1500, 1750,
  2000, 2500, 3000, 3500, 4000, 5000, 6000, 7000, 8000,
];

const MIB = 1024 * 1024;
const memSteps = [
  64, 128, 192, 256, 320, 384, 448, 512, 640, 768, 896, 1024, 1280, 1536, 1792,
  2048, 2560, 3072, 3584, 4096, 5120, 6144, 7168, 8192, 10240, 12288, 14336,
  16384,
].map((mib) => mib * MIB);

function formatCpuDisplay(millicores: number): string {
  if (millicores >= 1000) {
    const cores = millicores / 1000;
    return `${cores} core${cores > 1 ? "s" : ""}`;
  }
  return `${millicores}m`;
}

function formatMemDisplay(bytes: number): string {
  const gib = bytes / (1024 * MIB);
  if (gib >= 1) return `${Number.isInteger(gib) ? gib : gib.toFixed(1)}Gi`;
  return `${bytes / MIB}Mi`;
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
  formatDisplay,
}: {
  label: string;
  minValue: number;
  maxValue: number;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
  steps: number[];
  formatDisplay: (v: number) => string;
}) {
  const minIdx = closestIndex(steps, minValue);
  const maxIdx = closestIndex(steps, maxValue);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <span className="text-sm text-muted-foreground font-mono">
          {formatDisplay(minValue)} – {formatDisplay(maxValue)}
        </span>
      </div>
      <Slider
        value={[minIdx, maxIdx]}
        onValueChange={([lo, hi]) => {
          if (lo !== undefined && steps[lo] !== undefined)
            onMinChange(steps[lo]);
          if (hi !== undefined && steps[hi] !== undefined)
            onMaxChange(steps[hi]);
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
  control: Control<ServiceFormValues>;
  showReplicas?: boolean;
}) {
  return (
    <div className="space-y-3">
      {showReplicas && (
        <Controller
          name="replicas"
          control={control}
          render={({ field, fieldState }) => {
            const value = Number.isFinite(field.value) ? field.value : 1;
            return (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Replicas</FieldLabel>
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
          name="compute.cpuRequest"
          control={control}
          render={({ field: reqField }) => (
            <Controller
              name="compute.cpuLimit"
              control={control}
              render={({ field: limField }) => (
                <ResourceRange
                  label="CPU"
                  minValue={reqField.value}
                  maxValue={limField.value}
                  onMinChange={reqField.onChange}
                  onMaxChange={limField.onChange}
                  steps={cpuSteps}
                  formatDisplay={formatCpuDisplay}
                />
              )}
            />
          )}
        />

        <Controller
          name="compute.memoryRequest"
          control={control}
          render={({ field: reqField }) => (
            <Controller
              name="compute.memoryLimit"
              control={control}
              render={({ field: limField }) => (
                <ResourceRange
                  label="Memory"
                  minValue={reqField.value}
                  maxValue={limField.value}
                  onMinChange={reqField.onChange}
                  onMaxChange={limField.onChange}
                  steps={memSteps}
                  formatDisplay={formatMemDisplay}
                />
              )}
            />
          )}
        />
      </div>
    </div>
  );
}
