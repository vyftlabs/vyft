import { useMutation } from "@tanstack/react-query";
import type { PostgresBackup, Resource } from "@vyft/spec";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { defaultBackup } from "@/components/service/form/postgres";
import * as api from "@/lib/api";
import { getPostgresSpec } from "@/lib/resource";

const COMPRESSIONS = ["none", "gzip", "snappy", "zstd"] as const;

// BackupConfigDialog edits a postgres resource's backup config (CNPG
// barmanObjectStore + schedule). Saves explicitly — unlike the autosaving
// settings form — so half-typed credentials aren't persisted.
export function BackupConfigDialog({
  resource,
  projectId,
  open,
  onOpenChange,
}: {
  resource: Resource;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const spec = getPostgresSpec(resource);
  const existing = spec?.backup;
  const configured = !!existing;

  const { register, control, handleSubmit, reset } = useForm<PostgresBackup>({
    defaultValues: existing ?? defaultBackup,
  });

  useEffect(() => {
    if (open) reset(existing ?? defaultBackup);
  }, [open, existing, reset]);

  const save = (backup: PostgresBackup | undefined) => {
    if (!spec) return;
    update.mutate({
      projectId,
      id: resource.id,
      body: { config: { kind: "postgres", spec: { ...spec, backup } } },
    });
  };

  const update = useMutation({
    ...api.resources.update,
    onSuccess: () => {
      toast.success("Backup settings saved.");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = (values: PostgresBackup) => save(values);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Backup settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Field>
              <FieldLabel htmlFor="bk-dest">Destination path</FieldLabel>
              <Input
                id="bk-dest"
                data-testid="service.backups.dialog.dest"
                placeholder="s3://my-bucket/postgres"
                className="font-mono"
                {...register("destinationPath")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="bk-endpoint">
                Endpoint URL (optional)
              </FieldLabel>
              <Input
                id="bk-endpoint"
                data-testid="service.backups.dialog.endpoint"
                placeholder="https://… (R2, MinIO)"
                {...register("endpointURL")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="bk-region">Region (optional)</FieldLabel>
              <Input
                id="bk-region"
                data-testid="service.backups.dialog.region"
                placeholder="us-east-1"
                {...register("region")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="bk-akid">Access key ID</FieldLabel>
              <Input
                id="bk-akid"
                data-testid="service.backups.dialog.akid"
                autoComplete="off"
                {...register("accessKeyId")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="bk-sak">Secret access key</FieldLabel>
              <Input
                id="bk-sak"
                data-testid="service.backups.dialog.sak"
                type="password"
                autoComplete="off"
                {...register("secretAccessKey")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="bk-schedule">Schedule (cron)</FieldLabel>
              <Input
                id="bk-schedule"
                placeholder="0 0 2 * * *"
                className="font-mono"
                {...register("schedule")}
              />
              <p className="text-[11px] text-muted-foreground">
                6-field cron (seconds first). Default: daily at 02:00.
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="bk-retention">Retention (days)</FieldLabel>
              <Input
                id="bk-retention"
                type="number"
                min={1}
                {...register("retentionDays", { valueAsNumber: true })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="bk-compression">Compression</FieldLabel>
              <Controller
                name="compression"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="bk-compression">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPRESSIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <DialogFooter className="sm:justify-between">
            {configured ? (
              <Button
                type="button"
                variant="ghost"
                className="text-severity-critical-text"
                disabled={update.isPending}
                onClick={() => save(undefined)}
              >
                Disable backups
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" data-testid="service.backups.dialog.save" disabled={update.isPending}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
