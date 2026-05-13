import { useMutation, useQuery } from "@tanstack/react-query";
import type { Source, SourceCreate, SourceKind } from "@vyft/spec";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  LoaderIcon,
  PencilIcon,
  PlugZapIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/lib/api";
import { sourcePresets } from "@/lib/source-presets";

export default function SourcesPage() {
  const { data: sources, isLoading } = useQuery(api.sources.list);
  const [dialogMode, setDialogMode] = useState<
    { type: "closed" } | { type: "create" } | { type: "edit"; source: Source }
  >({ type: "closed" });

  const metricsSources = (sources ?? []).filter(
    (s: Source) => s.domain === "metrics",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sources</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Where Vyft pulls observability data from.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Metrics</h2>
          <Button
            size="sm"
            onClick={() => setDialogMode({ type: "create" })}
            disabled={isLoading}
          >
            <PlusIcon />
            Add metrics source
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-[62px] w-full rounded-md" />
        ) : metricsSources.length === 0 ? (
          <ListEmpty>
            No metrics source configured. Add one to enable the metrics panels
            in the service view.
          </ListEmpty>
        ) : (
          <List>
            {metricsSources.map((src: Source) => (
              <SourceRow
                key={src.id}
                source={src}
                onEdit={() => setDialogMode({ type: "edit", source: src })}
              />
            ))}
          </List>
        )}
      </section>

      <SourceDialog
        mode={dialogMode}
        onClose={() => setDialogMode({ type: "closed" })}
      />
    </div>
  );
}

function SourceRow({
  source,
  onEdit,
}: {
  source: Source;
  onEdit: () => void;
}) {
  const preset = sourcePresets.find((p) => p.id === source.kind);
  const Icon = preset?.icon;
  const remove = useMutation(api.sources.remove);
  const promote = useMutation(api.sources.promoteDefault);
  const test = useMutation(api.sources.test);

  const runTest = () => {
    test.mutate(source.id, {
      onSuccess: (r) => {
        if (r.ok) toast.success(`${source.name}: reachable`);
        else toast.error(`${source.name}: ${r.error ?? "unreachable"}`);
      },
      onError: (err: Error) => toast.error(err.message),
    });
  };

  return (
    <ListItem>
      {Icon && (
        <ListIcon>
          <Icon />
        </ListIcon>
      )}
      <ListContent>
        <ListTitle className="flex items-center gap-2">
          {source.name}
          {source.isDefault && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-primary">
              <CheckCircle2Icon className="size-3" />
              Default
            </span>
          )}
        </ListTitle>
        <ListDescription className="font-mono">
          {preset?.name ?? source.kind}
          {source.kind === "prometheus" && ` · ${source.config.url}`}
        </ListDescription>
      </ListContent>
      <ListAction className="opacity-0 group-hover/list-item:opacity-100 flex gap-1">
        <Button
          size="xs"
          variant="outline"
          disabled={test.isPending}
          onClick={runTest}
        >
          {test.isPending ? (
            <LoaderIcon className="size-3.5 animate-spin" />
          ) : (
            <PlugZapIcon className="size-3.5" />
          )}
          Test
        </Button>
        {!source.isDefault && (
          <Button
            size="xs"
            variant="outline"
            disabled={promote.isPending}
            onClick={() =>
              promote.mutate(source.id, {
                onError: (err: Error) => toast.error(err.message),
              })
            }
          >
            Make default
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={onEdit}
        >
          <PencilIcon className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(source.id, {
              onError: (err: Error) => toast.error(err.message),
            })
          }
        >
          {remove.isPending ? (
            <LoaderIcon className="size-3.5 animate-spin" />
          ) : (
            <Trash2Icon className="size-3.5" />
          )}
        </Button>
      </ListAction>
    </ListItem>
  );
}

type FormValues = {
  name: string;
  url: string;
  authType: "none" | "basic" | "bearer";
  username: string;
  password: string;
  token: string;
};

type DialogMode =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; source: Source };

function defaultsFor(source: Source | undefined): FormValues {
  if (!source) {
    return {
      name: "",
      url: "",
      authType: "none",
      username: "",
      password: "",
      token: "",
    };
  }
  if (source.kind === "prometheus") {
    const auth = source.config.auth;
    return {
      name: source.name,
      url: source.config.url,
      authType: auth.type,
      username: auth.type === "basic" ? auth.username : "",
      // Secret values never come back from the server. Operator re-enters
      // password/token if they want to rotate; if blank, backend keeps
      // the existing auth bytes (matches registries behaviour).
      password: "",
      token: "",
    };
  }
  return {
    name: source.name,
    url: "",
    authType: "none",
    username: "",
    password: "",
    token: "",
  };
}

function SourceDialog({
  mode,
  onClose,
}: {
  mode: DialogMode;
  onClose: () => void;
}) {
  const open = mode.type !== "closed";
  const editing = mode.type === "edit" ? mode.source : null;
  const [page, setPage] = useState<"picker" | SourceKind>("picker");
  const create = useMutation(api.sources.create);
  const patch = useMutation(api.sources.patch);
  const { register, handleSubmit, watch, reset } = useForm<FormValues>({
    defaultValues: defaultsFor(editing ?? undefined),
  });

  useEffect(() => {
    if (mode.type === "edit") {
      setPage(mode.source.kind);
      reset(defaultsFor(mode.source));
    } else if (mode.type === "create") {
      setPage("picker");
      reset(defaultsFor(undefined));
    }
  }, [mode, reset]);

  const authType = watch("authType");

  const selected =
    page !== "picker" ? sourcePresets.find((p) => p.id === page) : undefined;

  const close = () => {
    setPage("picker");
    reset(defaultsFor(undefined));
    onClose();
  };

  const submitting = create.isPending || patch.isPending;

  const onSubmit = handleSubmit((data) => {
    if (!selected) return;
    const body = toCreateBody(selected.id, data);
    if (!body) return;
    if (editing) {
      patch.mutate(
        { id: editing.id, body },
        {
          onSuccess: () => close(),
          onError: (err: Error) => toast.error(err.message),
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => close(),
        onError: (err: Error) => toast.error(err.message),
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? undefined : close())}>
      <DialogContent className="p-0 gap-0 overflow-hidden">
        {page === "picker" && (
          <Command className="rounded-none border-0">
            <CommandInput placeholder="Search sources..." />
            <CommandList>
              <CommandEmpty>No source found.</CommandEmpty>
              <CommandGroup heading="Metrics">
                {sourcePresets.map((preset) => {
                  const PIcon = preset.icon;
                  return (
                    <CommandItem
                      key={preset.id}
                      onSelect={() => setPage(preset.id)}
                    >
                      <PIcon className="text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p>{preset.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {preset.blurb}
                        </p>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        )}

        {selected && (
          <form onSubmit={onSubmit} className="flex flex-col">
            <DialogHeader className="px-6 pt-4 pb-0 flex-row items-center gap-3 space-y-0">
              {!editing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setPage("picker");
                    reset(defaultsFor(undefined));
                  }}
                >
                  <ArrowLeftIcon className="size-4" />
                </Button>
              )}
              <DialogTitle>
                {editing ? `Edit ${editing.name}` : selected.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 px-6 py-4">
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input
                  {...register("name", { required: true })}
                  placeholder={
                    selected.id === "prometheus" ? "prom-prod" : "metrics-server"
                  }
                  autoFocus
                />
              </Field>

              {selected.id === "prometheus" && (
                <>
                  <Field>
                    <FieldLabel>URL</FieldLabel>
                    <Input
                      {...register("url", { required: true })}
                      placeholder="https://prom.example.com"
                      className="font-mono"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Auth</FieldLabel>
                    <Select
                      value={authType}
                      onValueChange={(v) => {
                        if (v)
                          reset(
                            { ...watch(), authType: v as FormValues["authType"] },
                            { keepValues: true },
                          );
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="bearer">Bearer token</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {authType === "basic" && (
                    <>
                      <Field>
                        <FieldLabel>Username</FieldLabel>
                        <Input {...register("username", { required: true })} />
                      </Field>
                      <Field>
                        <FieldLabel>Password</FieldLabel>
                        <Input
                          {...register("password", {
                            required: !editing,
                          })}
                          type="password"
                          placeholder={editing ? "(unchanged)" : ""}
                        />
                      </Field>
                    </>
                  )}
                  {authType === "bearer" && (
                    <Field>
                      <FieldLabel>Token</FieldLabel>
                      <Input
                        {...register("token", { required: !editing })}
                        type="password"
                        placeholder={editing ? "(unchanged)" : ""}
                      />
                    </Field>
                  )}
                </>
              )}

              {selected.id === "metricsServer" && (
                <p className="text-xs text-muted-foreground">
                  metrics-server runs inside the cluster — no URL or auth
                  needed.
                </p>
              )}
            </div>

            <DialogFooter className="px-6 py-4 border-t mx-0 mb-0 rounded-none">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting
                  ? editing
                    ? "Saving..."
                    : "Adding..."
                  : editing
                    ? "Save"
                    : "Add source"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function toCreateBody(kind: SourceKind, data: FormValues): SourceCreate | null {
  if (kind === "metricsServer") {
    return {
      kind: "metricsServer",
      name: data.name.trim(),
      domain: "metrics",
      config: {},
    };
  }
  const auth =
    data.authType === "basic"
      ? {
          type: "basic" as const,
          username: data.username.trim(),
          password: data.password,
        }
      : data.authType === "bearer"
        ? { type: "bearer" as const, token: data.token }
        : { type: "none" as const };
  return {
    kind: "prometheus",
    name: data.name.trim(),
    domain: "metrics",
    config: {
      url: data.url.trim(),
      auth,
    },
  };
}
