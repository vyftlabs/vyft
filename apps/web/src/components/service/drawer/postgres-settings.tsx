import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  type Resource,
  type ResourceAppCreate,
  ResourcePostgresCreate,
} from "@vyft/spec";
import { useCallback, useEffect, useRef } from "react";
import { type Control, Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as api from "@/lib/api";
import { ScalingForm } from "../form";
import { fromPostgresResource, toPostgresUpdate } from "../form/postgres";

const PG_VERSIONS = ["14", "15", "16", "17"] as const;

// PostgresSettings is the create + edit form for a managed Postgres resource.
// Distinct from the app SettingsTab: no source/variables/routes/health —
// version + database are fixed at bootstrap (disabled after create), the rest
// (instances/storage/compute) is editable and autosaves like the app form.
export function PostgresSettings({
  resource,
  projectId,
  createProps,
}: {
  resource?: Resource;
  projectId: string;
  createProps?: {
    onCreated: (id: string) => void;
    position?: { x: number; y: number };
  };
}) {
  const isCreating = !resource;

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitted },
  } = useForm<ResourcePostgresCreate>({
    resolver: zodResolver(ResourcePostgresCreate),
    defaultValues: fromPostgresResource(resource),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  useEffect(() => {
    if (resource) reset(fromPostgresResource(resource));
  }, [resource, reset]);

  const createResource = useMutation({
    ...api.resources.create,
    onError: (err: Error) => toast.error(err.message),
  });
  const updateResource = useMutation({
    ...api.resources.update,
    onError: (err: Error) => toast.error(err.message),
  });

  const onSubmit = useCallback(
    (data: ResourcePostgresCreate) => {
      if (isCreating && createProps) {
        const body: ResourcePostgresCreate = {
          ...data,
          name: data.name.trim(),
          positionX: createProps.position?.x ?? 0,
          positionY: createProps.position?.y ?? 0,
        };
        createResource.mutate(
          { projectId, body },
          { onSuccess: (created) => createProps.onCreated(created.id) },
        );
      } else if (resource) {
        updateResource.mutate(
          { projectId, id: resource.id, body: toPostgresUpdate(data) },
          { onSuccess: () => reset(data, { keepValues: true }) },
        );
      }
    },
    [
      isCreating,
      createProps,
      createResource,
      updateResource,
      projectId,
      resource,
      reset,
    ],
  );

  // Debounced autosave on edit (mirrors the app SettingsTab).
  const submitRef = useRef(() => handleSubmit(onSubmit)());
  useEffect(() => {
    submitRef.current = () => handleSubmit(onSubmit)();
  }, [handleSubmit, onSubmit]);
  const watched = useWatch({ control });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: watched drives the debounce
  useEffect(() => {
    if (isCreating || !resource || !isDirty) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => submitRef.current(), 800);
    return () => clearTimeout(timer.current);
  }, [isCreating, resource, isDirty, watched]);

  return (
    <ScrollArea className="h-full -mr-6">
      <form
        id={isCreating ? "create-service-form" : undefined}
        className="space-y-6 pr-6 pb-[40vh]"
        onSubmit={handleSubmit(onSubmit)}
      >
        {isCreating && (
          <Field data-invalid={isSubmitted && !!errors.name}>
            <FieldLabel htmlFor="pg-name">Name</FieldLabel>
            <Input
              id="pg-name"
              data-testid="service.form.name"
              placeholder="my-database"
              autoFocus
              {...register("name")}
            />
            {isSubmitted && errors.name && <FieldError errors={[errors.name]} />}
          </Field>
        )}

        <Field data-invalid={isSubmitted && !!errors.config?.spec?.database}>
          <FieldLabel htmlFor="pg-db">Database</FieldLabel>
          <Input
            id="pg-db"
            placeholder="appdb"
            disabled={!isCreating}
            {...register("config.spec.database")}
          />
          {isSubmitted && errors.config?.spec?.database && (
            <FieldError errors={[errors.config.spec.database]} />
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="pg-version">Version</FieldLabel>
          <Controller
            name="config.spec.version"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={!isCreating}
              >
                <SelectTrigger id="pg-version">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PG_VERSIONS.map((v) => (
                    <SelectItem key={v} value={v}>
                      Postgres {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="pg-storage">Storage (MB)</FieldLabel>
          <Input
            id="pg-storage"
            type="number"
            min={1024}
            step={1024}
            {...register("config.spec.storage", { valueAsNumber: true })}
          />
        </Field>

        {/* Reuse the service Scaling inputs — instances + cpu/memory sliders
            share the same config.spec field paths. Cast: the control is the
            postgres form, but those paths/values are identical. */}
        <ScalingForm
          control={control as unknown as Control<ResourceAppCreate>}
          isSubmitted={isSubmitted}
        />
      </form>
    </ScrollArea>
  );
}
