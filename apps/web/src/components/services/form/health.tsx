import { type Control, Controller, useWatch } from "react-hook-form"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { HealthFormValues } from "./types"

export function HealthForm({
  control,
}: {
  control: Control<HealthFormValues>
}) {
  const healthCheckType = useWatch({ control, name: "healthCheckType" })

  return (
    <div className="space-y-3">
      <Controller
        name="healthCheckType"
        control={control}
        render={({ field }) => (
          <Field>
            <FieldLabel>Type</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="tcp">TCP</SelectItem>
                <SelectItem value="exec">Command</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
      />

      {healthCheckType === "http" && (
        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="healthCheckPath"
            control={control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Path</FieldLabel>
                <Input {...field} id={field.name} placeholder="/health" className="font-mono" />
              </Field>
            )}
          />
          <Controller
            name="healthCheckPort"
            control={control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Port</FieldLabel>
                <Input {...field} id={field.name} type="number" placeholder="8080" />
              </Field>
            )}
          />
        </div>
      )}

      {healthCheckType === "tcp" && (
        <Controller
          name="healthCheckPort"
          control={control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Port</FieldLabel>
              <Input {...field} id={field.name} type="number" placeholder="8080" />
            </Field>
          )}
        />
      )}

      {healthCheckType === "exec" && (
        <Controller
          name="healthCheckCommand"
          control={control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Command</FieldLabel>
              <Input {...field} id={field.name} placeholder="curl -f http://localhost:8080/health" className="font-mono" />
            </Field>
          )}
        />
      )}
    </div>
  )
}
