import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  Source,
  SourceCreate,
  SourceDomain,
  SourceKind,
} from "@vyft/spec";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CheckIcon,
  LoaderIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
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

type DialogMode =
  | { type: "closed" }
  | { type: "create"; domain: SourceDomain }
  | { type: "edit"; source: Source };

export default function SourcesPage() {
  const { data: sources, isLoading } = useQuery(api.sources.list);
  const [dialogMode, setDialogMode] = useState<DialogMode>({ type: "closed" });

  const byDomain = (d: SourceDomain) =>
    (sources ?? []).filter((s: Source) => s.domain === d);

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

      <Section
        domain="metrics"
        label="Metrics"
        emptyText="No metrics source configured. Add one to enable the metrics panels in the service view."
        sources={byDomain("metrics")}
        loading={isLoading}
        onAdd={() => setDialogMode({ type: "create", domain: "metrics" })}
        onEdit={(s) => setDialogMode({ type: "edit", source: s })}
      />

      <Section
        domain="logs"
        label="Logs"
        emptyText="No logs source configured. Add one to enable the logs panel in the service view."
        sources={byDomain("logs")}
        loading={isLoading}
        onAdd={() => setDialogMode({ type: "create", domain: "logs" })}
        onEdit={(s) => setDialogMode({ type: "edit", source: s })}
      />

      <SourceDialog
        mode={dialogMode}
        onClose={() => setDialogMode({ type: "closed" })}
      />
    </div>
  );
}

function Section({
  domain,
  label,
  emptyText,
  sources,
  loading,
  onAdd,
  onEdit,
}: {
  domain: SourceDomain;
  label: string;
  emptyText: string;
  sources: Source[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (s: Source) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{label}</h2>
        <Button size="sm" onClick={onAdd} disabled={loading}>
          <PlusIcon />
          Add {domain} source
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-[62px] w-full rounded-md" />
      ) : sources.length === 0 ? (
        <ListEmpty>{emptyText}</ListEmpty>
      ) : (
        <List>
          {sources.map((src) => (
            <SourceRow key={src.id} source={src} onEdit={() => onEdit(src)} />
          ))}
        </List>
      )}
    </section>
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
  if (source.kind === "prometheus" || source.kind === "loki") {
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

// Kinds that need a URL + auth picker (parallel domain pattern: one
// "external HTTP backend" + one "in-cluster always-on" per domain).
const URL_KINDS: SourceKind[] = ["prometheus", "loki"];
const NO_CONFIG_KINDS: SourceKind[] = ["metricsServer", "kubeLogs"];

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
  const [testResult, setTestResult] = useState<{ ok: boolean } | null>(null);
  const [testing, setTesting] = useState(false);

  // After a test result shows, revert the button to its original label after
  // a short window so the UI doesn't latch on a stale state.
  useEffect(() => {
    if (!testResult) return;
    const timer = setTimeout(() => setTestResult(null), 3_000);
    return () => clearTimeout(timer);
  }, [testResult]);
  const create = useMutation(api.sources.create);
  const patch = useMutation(api.sources.patch);
  const test = useMutation(api.sources.test);
  const { register, handleSubmit, watch, reset, getValues, setValue } = useForm<FormValues>({
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
    setTestResult(null);
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
        {page === "picker" &&
          mode.type === "create" &&
          (() => {
            const filtered = sourcePresets.filter(
              (p) => p.domain === mode.domain,
            );
            const heading = mode.domain === "metrics" ? "Metrics" : "Logs";
            return (
              <Command className="rounded-none border-0">
                <CommandInput
                  placeholder={`Search ${mode.domain} sources...`}
                />
                <CommandList>
                  <CommandEmpty>No source found.</CommandEmpty>
                  <CommandGroup heading={heading}>
                    {filtered.map((preset) => {
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
            );
          })()}

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
                  placeholder={namePlaceholder(selected.id)}
                  autoFocus
                />
              </Field>

              {URL_KINDS.includes(selected.id) && (
                <>
                  <Field>
                    <FieldLabel>URL</FieldLabel>
                    <Input
                      {...register("url", { required: true })}
                      placeholder={urlPlaceholder(selected.id)}
                      className="font-mono"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Auth</FieldLabel>
                    <Select
                      value={authType}
                      onValueChange={(v) => {
                        if (v) setValue("authType", v as FormValues["authType"]);
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
                          {...register("password", { required: !editing })}
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

              {NO_CONFIG_KINDS.includes(selected.id) && (
                <p className="text-xs text-muted-foreground">
                  {selected.name} runs inside the cluster — no URL or auth
                  needed.
                </p>
              )}
            </div>

            <DialogFooter className="flex-col items-stretch px-6 py-4 border-t mx-0 mb-0 rounded-none gap-2 sm:flex-col sm:items-stretch">
              <Button
                type="button"
                variant="outline"
                disabled={testing || !selected}
                onClick={async () => {
                  if (!selected) return;
                  const body = toCreateBody(selected.id, getValues());
                  if (!body) return;
                  setTestResult(null);
                  setTesting(true);
                  // TODO(dev): drop the artificial delay before shipping.
                  const fakeDelay = new Promise((r) => setTimeout(r, 1500));
                  try {
                    const [r] = await Promise.all([
                      test.mutateAsync(body),
                      fakeDelay,
                    ]);
                    setTestResult({ ok: r.ok });
                    if (!r.ok) {
                      toast.error(r.error ?? "Connection failed");
                    }
                  } catch (err) {
                    setTestResult({ ok: false });
                    toast.error(
                      err instanceof Error ? err.message : "Connection failed",
                    );
                  } finally {
                    setTesting(false);
                  }
                }}
                className={
                  testResult?.ok
                    ? "border-severity-success/40 bg-severity-success/10 text-severity-success-text hover:bg-severity-success/15 hover:text-severity-success-text"
                    : testResult
                      ? "border-severity-critical/40 bg-severity-critical/10 text-severity-critical-text hover:bg-severity-critical/15 hover:text-severity-critical-text"
                      : undefined
                }
              >
                {testing ? (
                  "Testing…"
                ) : testResult ? (
                  <>
                    {testResult.ok ? (
                      <CheckIcon className="size-3.5" />
                    ) : (
                      <XIcon className="size-3.5" />
                    )}
                    <span className="truncate">
                      {testResult.ok ? "Working" : "Failed"}
                    </span>
                  </>
                ) : (
                  "Test"
                )}
              </Button>
              <Button type="submit" disabled={submitting}>
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

function namePlaceholder(kind: SourceKind): string {
  switch (kind) {
    case "prometheus": return "prom-prod";
    case "metricsServer": return "metrics-server";
    case "loki": return "loki-prod";
    case "kubeLogs": return "kubernetes";
  }
}

function urlPlaceholder(kind: SourceKind): string {
  switch (kind) {
    case "prometheus": return "https://prom.example.com";
    case "loki": return "https://loki.example.com";
    default: return "";
  }
}

function toCreateBody(kind: SourceKind, data: FormValues): SourceCreate | null {
  const name = data.name.trim();
  switch (kind) {
    case "metricsServer":
      return { kind, name, domain: "metrics", config: {} };
    case "kubeLogs":
      return { kind, name, domain: "logs", config: {} };
    case "prometheus":
    case "loki": {
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
      const domain: SourceDomain = kind === "prometheus" ? "metrics" : "logs";
      return {
        kind,
        name,
        domain,
        config: { url: data.url.trim(), auth },
      };
    }
  }
}
