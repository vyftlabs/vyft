import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  type Resource,
  type ResourceAppCreate,
  ResourceRedisCreate,
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
import { fromRedisResource, toRedisUpdate } from "../form/redis";

const REDIS_VERSIONS = ["6", "7"] as const;

// RedisSettings is the create + edit form for a managed Redis resource. No
// source/routes/health — version is fixed at create; storage + compute are
// editable and autosave like the app form. cpu/memory reuse ScalingForm
// (instances hidden — a cache is single-node).
export function RedisSettings({
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
  } = useForm<ResourceRedisCreate>({
    resolver: zodResolver(ResourceRedisCreate),
    defaultValues: fromRedisResource(resource),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  useEffect(() => {
    if (resource) reset(fromRedisResource(resource));
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
    (data: ResourceRedisCreate) => {
      if (isCreating && createProps) {
        const body: ResourceRedisCreate = {
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
          { projectId, id: resource.id, body: toRedisUpdate(data) },
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
            <FieldLabel htmlFor="redis-name">Name</FieldLabel>
            <Input
              id="redis-name"
              placeholder="my-cache"
              autoFocus
              {...register("name")}
            />
            {isSubmitted && errors.name && <FieldError errors={[errors.name]} />}
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="redis-version">Version</FieldLabel>
          <Controller
            name="config.spec.version"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={!isCreating}
              >
                <SelectTrigger id="redis-version">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REDIS_VERSIONS.map((v) => (
                    <SelectItem key={v} value={v}>
                      Redis {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="redis-storage">Storage (MB, 0 = none)</FieldLabel>
          <Input
            id="redis-storage"
            type="number"
            min={0}
            step={256}
            {...register("config.spec.storage", { valueAsNumber: true })}
          />
        </Field>

        {/* Reuse the service Scaling inputs (cpu/memory) — same config.spec
            field paths. Instances hidden: a cache is single-node. */}
        <ScalingForm
          control={control as unknown as Control<ResourceAppCreate>}
          showInstances={false}
          isSubmitted={isSubmitted}
        />
      </form>
    </ScrollArea>
  );
}
