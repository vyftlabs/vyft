import { useMutation, useQuery } from "@tanstack/react-query";
import type { Registry } from "@vyft/spec";
import { ArrowLeftIcon, LoaderIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  List,
  ListAction,
  ListContent,
  ListDescription,
  ListEmpty,
  ListIcon,
  ListItem,
  ListTitle,
} from "@/components/ui/list";
import { Skeleton } from "@/components/ui/skeleton";

import * as api from "@/lib/api";
import { type RegistryPreset, registryPresets } from "@/lib/registry-presets";

export default function GlobalRegistries() {
  const { data: registryList, isLoading } = useQuery(api.registries.list);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Registries</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Container registries available to all projects.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
          disabled={isLoading}
          data-testid="registry-add-button"
        >
          <PlusIcon />
          Add registry
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-px">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[62px] w-full rounded-none" />
          ))}
        </div>
      ) : !registryList || registryList.length === 0 ? (
        <ListEmpty>
          No registries configured. Add one to pull private container images.
        </ListEmpty>
      ) : (
        <List>
          {registryList.map((reg: Registry) => (
            <RegistryRow key={reg.id} registry={reg} />
          ))}
        </List>
      )}

      <AddRegistryDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function RegistryRow({
  registry,
}: {
  registry: { id: string; name: string; url: string; username: string };
}) {
  const preset = registryPresets.find((p) => p.id === registry.name);
  const Icon = preset?.icon;

  const deleteRegistry = useMutation(api.registries.remove);

  return (
    <ListItem data-testid="registry-row" data-name={registry.name}>
      {Icon && (
        <ListIcon>
          <Icon />
        </ListIcon>
      )}
      <ListContent>
        <ListTitle>{preset?.name ?? registry.name}</ListTitle>
        <ListDescription className="font-mono">{registry.url}</ListDescription>
      </ListContent>
      <ListAction className="opacity-0 group-hover/list-item:opacity-100">
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          disabled={deleteRegistry.isPending}
          onClick={() =>
            deleteRegistry.mutate(registry.id, {
              onError: (err: Error) => toast.error(err.message),
            })
          }
          data-testid="registry-row-delete"
        >
          {deleteRegistry.isPending ? (
            <LoaderIcon className="size-3.5 animate-spin" />
          ) : (
            <Trash2Icon className="size-3.5" />
          )}
        </Button>
      </ListAction>
    </ListItem>
  );
}

function AddRegistryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<string>("picker");
  const preset =
    step !== "picker" ? registryPresets.find((p) => p.id === step) : undefined;

  // Reset on re-open, not on close — otherwise the dialog flashes back to the
  // picker during its close animation.
  useEffect(() => {
    if (open) setStep("picker");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 overflow-hidden">
        {preset ? (
          <RegistryForm
            preset={preset}
            onBack={() => setStep("picker")}
            onSuccess={() => onOpenChange(false)}
          />
        ) : (
          <RegistryPicker onSelect={setStep} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RegistryPicker({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <Command className="rounded-none border-0">
      <CommandInput placeholder="Search registries..." />
      <CommandList>
        <CommandEmpty>No registry found.</CommandEmpty>
        <CommandGroup heading="Registries">
          {registryPresets.map((preset) => {
            const Icon = preset.icon;
            return (
              <CommandItem
                key={preset.id}
                onSelect={() => onSelect(preset.id)}
                data-testid={`registry-preset-${preset.id}`}
              >
                <Icon className="text-muted-foreground" />
                {preset.name}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

type RegistryFormValues = {
  customName: string;
  customUrl: string;
  username: string;
  password: string;
};

function RegistryForm({
  preset,
  onBack,
  onSuccess,
}: {
  preset: RegistryPreset;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const isCustom = preset.id === "custom";
  const { register, handleSubmit } = useForm<RegistryFormValues>({
    defaultValues: { customName: "", customUrl: "", username: "", password: "" },
  });
  const createRegistry = useMutation(api.registries.create);

  const onSubmit = handleSubmit((data) => {
    createRegistry.mutate(
      {
        name: isCustom ? data.customName.trim() : preset.id,
        url: isCustom ? data.customUrl.trim() : preset.url,
        username: data.username.trim(),
        password: data.password,
      },
      {
        onSuccess,
        onError: (err: Error) => toast.error(err.message),
      },
    );
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col">
      <DialogHeader className="px-6 pt-4 pb-0 flex-row items-center gap-3 space-y-0">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <DialogTitle>{preset.name}</DialogTitle>
      </DialogHeader>

      <div className="space-y-3 px-6 py-4">
        {isCustom && (
          <>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input
                {...register("customName", { required: true })}
                placeholder="My registry"
                autoFocus
                data-testid="registry-form-name"
              />
            </Field>
            <Field>
              <FieldLabel>URL</FieldLabel>
              <Input
                {...register("customUrl", { required: true })}
                placeholder="https://registry.example.com"
                className="font-mono"
                data-testid="registry-form-url"
              />
            </Field>
          </>
        )}
        <Field>
          <FieldLabel>Username</FieldLabel>
          <Input
            {...register("username", { required: true })}
            placeholder="username"
            autoFocus={!isCustom}
            data-testid="registry-form-username"
          />
        </Field>
        <Field>
          <FieldLabel>Password / Token</FieldLabel>
          <Input
            {...register("password", { required: true })}
            type="password"
            placeholder="••••••••"
            data-testid="registry-form-password"
          />
        </Field>
      </div>

      <DialogFooter className="px-6 py-4 border-t mx-0 mb-0 rounded-none">
        <Button
          type="submit"
          className="w-full"
          disabled={createRegistry.isPending}
          data-testid="registry-form-submit"
        >
          {createRegistry.isPending ? "Adding..." : "Add registry"}
        </Button>
      </DialogFooter>
    </form>
  );
}
