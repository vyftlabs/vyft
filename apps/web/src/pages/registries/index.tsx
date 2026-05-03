import { useMutation, useQuery } from "@tanstack/react-query";
import type { Registry } from "@vyft/spec";
import { ArrowLeftIcon, LoaderIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
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
import * as api from "@/lib/api";
import { registryPresets } from "@/lib/registry-presets";

export default function GlobalRegistries() {
  const { data: registryList = [] } = useQuery(api.registries.list);
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
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <PlusIcon />
          Add registry
        </Button>
      </div>

      {registryList.length === 0 ? (
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
    <ListItem>
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
  const [page, setPage] = useState<"picker" | string>("picker");
  const {
    register,
    handleSubmit,
    reset: resetForm,
  } = useForm({
    defaultValues: {
      customName: "",
      customUrl: "",
      username: "",
      password: "",
    },
  });

  const selectedPreset = registryPresets.find((r) => r.id === page);
  const isCustom = page === "custom";

  const createRegistry = useMutation(api.registries.create);

  const reset = () => {
    setPage("picker");
    resetForm();
  };

  const onSubmit = handleSubmit((data) => {
    if (!selectedPreset) return;
    createRegistry.mutate(
      {
        name: isCustom ? data.customName.trim() : selectedPreset.id,
        url: isCustom ? data.customUrl.trim() : selectedPreset.url,
        username: data.username.trim(),
        password: data.password,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
        onError: (err: Error) => toast.error(err.message),
      },
    );
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="p-0 gap-0 overflow-hidden">
        {page === "picker" && (
          <Command className="rounded-none border-0">
            <CommandInput placeholder="Search registries..." />
            <CommandList>
              <CommandEmpty>No registry found.</CommandEmpty>
              <CommandGroup heading="Registries">
                {registryPresets.map((preset) => {
                  const PIcon = preset.icon;
                  return (
                    <CommandItem
                      key={preset.id}
                      onSelect={() => setPage(preset.id)}
                    >
                      <PIcon className="text-muted-foreground" />
                      {preset.name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        )}

        {selectedPreset && (
          <form onSubmit={onSubmit} className="flex flex-col">
            <DialogHeader className="px-6 pt-4 pb-0 flex-row items-center gap-3 space-y-0">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setPage("picker");
                  resetForm();
                }}
              >
                <ArrowLeftIcon className="size-4" />
              </Button>
              <DialogTitle>{selectedPreset.name}</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 px-6 py-4">
              {isCustom && (
                <>
                  <Field>
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      {...register("customName", { required: isCustom })}
                      placeholder="My registry"
                      autoFocus
                    />
                  </Field>
                  <Field>
                    <FieldLabel>URL</FieldLabel>
                    <Input
                      {...register("customUrl", { required: isCustom })}
                      placeholder="https://registry.example.com"
                      className="font-mono"
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
                />
              </Field>
              <Field>
                <FieldLabel>Password / Token</FieldLabel>
                <Input
                  {...register("password", { required: true })}
                  type="password"
                  placeholder="••••••••"
                />
              </Field>
            </div>

            <DialogFooter className="px-6 py-4 border-t mx-0 mb-0 rounded-none">
              <Button
                type="submit"
                className="w-full"
                disabled={createRegistry.isPending}
              >
                {createRegistry.isPending ? "Adding..." : "Add registry"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
