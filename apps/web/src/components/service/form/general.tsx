import { type Control, Controller } from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { GeneralFormValues } from "./types";

export function GeneralForm({
  control,
  showName = true,
  showPort = true,
}: {
  control: Control<GeneralFormValues>;
  showName?: boolean;
  showPort?: boolean;
}) {
  return (
    <div className="space-y-3">
      {showName && (
        <Controller
          name="name"
          control={control}
          rules={{ required: "Name is required" }}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor={field.name}>Name</FieldLabel>
              <Input
                {...field}
                id={field.name}
                placeholder="api"
                autoFocus
                data-testid="service-name-input"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      )}

      <div className={showPort ? "flex items-end gap-3" : ""}>
        <Controller
          name="image"
          control={control}
          rules={{ required: "Image is required" }}
          render={({ field, fieldState }) => (
            <Field
              data-invalid={fieldState.invalid || undefined}
              className="!flex-1 !w-auto min-w-0"
            >
              <FieldLabel htmlFor={field.name}>Image</FieldLabel>
              <Input
                {...field}
                id={field.name}
                placeholder="ghcr.io/org/app:latest"
                className="font-mono"
                data-testid="service-image-input"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        {showPort && (
          <Controller
            name="port"
            control={control}
            rules={{ required: "Port is required" }}
            render={({ field, fieldState }) => (
              <Field
                data-invalid={fieldState.invalid || undefined}
                className="!w-auto shrink-0"
              >
                <FieldLabel htmlFor={field.name}>Port</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="number"
                  placeholder="8080"
                  className="!w-[12ch] font-mono"
                  data-testid="service-port-input"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        )}
      </div>

      <Controller
        name="command"
        control={control}
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={field.name}>Command</FieldLabel>
            <Input
              {...field}
              id={field.name}
              placeholder="npm start"
              className="font-mono"
            />
          </Field>
        )}
      />
    </div>
  );
}
