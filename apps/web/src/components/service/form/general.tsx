import type { ServiceAppCreate } from "@vyft/spec";
import { type Control, Controller } from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function GeneralForm({
  control,
  showName = true,
  showPort = true,
}: {
  control: Control<ServiceAppCreate>;
  showName?: boolean;
  showPort?: boolean;
}) {
  return (
    <div className="space-y-3">
      {showName && (
        <Controller
          name="name"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor={field.name}>Name</FieldLabel>
              <Input
                {...field}
                id={field.name}
                placeholder="api"
                autoFocus
                data-testid="service.form.name"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      )}

      <div className={showPort ? "flex items-end gap-3 mb-4" : ""}>
        <Controller
          name="service.spec.source.image"
          control={control}
          render={({ field, fieldState }) => (
            <Field
              data-invalid={fieldState.invalid || undefined}
              className="!flex-1 !w-auto min-w-0 !mb-0"
            >
              <FieldLabel htmlFor={field.name}>Image</FieldLabel>
              <Input
                {...field}
                id={field.name}
                placeholder="ghcr.io/org/app:latest"
                className="font-mono"
                data-testid="service.form.image"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        {showPort && (
          <Controller
            name="service.spec.port"
            control={control}
            render={({ field, fieldState }) => (
              <Field
                data-invalid={fieldState.invalid || undefined}
                className="!w-auto shrink-0"
              >
                <FieldLabel htmlFor={field.name}>Port</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  type="number"
                  value={
                    field.value != null && Number.isFinite(field.value)
                      ? field.value
                      : ""
                  }
                  onChange={(e) => {
                    const n = e.target.valueAsNumber;
                    field.onChange(Number.isFinite(n) ? n : undefined);
                  }}
                  placeholder="8080"
                  className="!w-[12ch] font-mono"
                  data-testid="service.form.port"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        )}
      </div>

      <Controller
        name="service.spec.startCommand"
        control={control}
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={field.name}>Command</FieldLabel>
            <Input
              id={field.name}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value || undefined)}
              placeholder="npm start"
              className="font-mono"
              data-testid="service.form.startCommand"
            />
          </Field>
        )}
      />
    </div>
  );
}
