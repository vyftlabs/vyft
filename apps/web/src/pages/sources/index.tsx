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
  LockIcon,
  MoreHorizontalIcon,
  PlusIcon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  const locked = source.provisioned && !source.editable;

  return (
    <ListItem
      className="cursor-pointer"
      onClick={onEdit}
    >
      {Icon && (
        <ListIcon>
          <Icon />
        </ListIcon>
      )}
      <ListContent>
        <ListTitle className="flex items-center gap-1.5">
          {source.name}
          {source.isDefault && (
            <Tooltip>
              <TooltipTrigger
                render={<CheckCircle2Icon className="size-3 text-primary" />}
              />
              <TooltipContent>Default for {source.domain}</TooltipContent>
            </Tooltip>
          )}
          {locked && (
            <Tooltip>
              <TooltipTrigger
                render={<LockIcon className="size-3 text-muted-foreground" />}
              />
              <TooltipContent>Provisioned · read-only</TooltipContent>
            </Tooltip>
          )}
        </ListTitle>
        <ListDescription className="font-mono">
          {preset?.name ?? source.kind}
          {source.kind === "prometheus" && ` · ${source.config.url}`}
        </ListDescription>
      </ListContent>
      <ListAction
        className="opacity-0 group-hover/list-item:opacity-100 flex gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {(!source.isDefault || !locked) && (
          <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={remove.isPending || promote.isPending}
              />
            }
          >
            <MoreHorizontalIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!source.isDefault && (
              <DropdownMenuItem
                onClick={() =>
                  promote.mutate(source.id, {
                    onError: (err: Error) => toast.error(err.message),
                  })
                }
              >
                Make default
              </DropdownMenuItem>
            )}
            {!locked && (
              <DropdownMenuItem
                variant="destructive"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(source.id, {
                    onError: (err: Error) => toast.error(err.message),
                  })
                }
              >
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        )}
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
  const locked = !!editing && editing.provisioned && !editing.editable;
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
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { isDirty, errors, isSubmitted },
  } = useForm<FormValues>({
    defaultValues: defaultsFor(editing ?? undefined),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const showError = (field: keyof FormValues): boolean =>
    isSubmitted && !!errors[field];

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
              <DialogTitle className="flex items-center gap-2">
                {editing ? `Edit ${editing.name}` : selected.name}
                {locked && (
                  <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <LockIcon className="size-3.5" />
                    Read-only
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 px-6 py-4">
              <Field data-invalid={showError("name") && !!errors.name}>
                <FieldLabel htmlFor="source-name">Name</FieldLabel>
                <Input
                  id="source-name"
                  {...register("name", {
                    required: "Name is required",
                    maxLength: { value: 100, message: "Max 100 characters" },
                  })}
                  placeholder={namePlaceholder(selected.id)}
                  autoFocus
                  readOnly={locked}
                  aria-invalid={showError("name") && !!errors.name}
                />
                {showError("name") && <FieldError errors={[errors.name]} />}
              </Field>

              {URL_KINDS.includes(selected.id) && (
                <>
                  <Field data-invalid={showError("url") && !!errors.url}>
                    <FieldLabel htmlFor="source-url">URL</FieldLabel>
                    <Input
                      id="source-url"
                      {...register("url", {
                        required: "URL is required",
                        pattern: {
                          value: /^https?:\/\/.+/i,
                          message: "Must start with http:// or https://",
                        },
                      })}
                      placeholder={urlPlaceholder(selected.id)}
                      className="font-mono"
                      readOnly={locked}
                      aria-invalid={showError("url") && !!errors.url}
                    />
                    {showError("url") && <FieldError errors={[errors.url]} />}
                  </Field>
                  <Field>
                    <FieldLabel>Auth</FieldLabel>
                    <Select
                      value={authType}
                      onValueChange={(v) => {
                        if (v) setValue("authType", v as FormValues["authType"]);
                      }}
                      disabled={locked}
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
                      <Field
                        data-invalid={
                          showError("username") && !!errors.username
                        }
                      >
                        <FieldLabel htmlFor="source-username">
                          Username
                        </FieldLabel>
                        <Input
                          id="source-username"
                          {...register("username", {
                            required: "Username is required",
                          })}
                          readOnly={locked}
                          aria-invalid={
                            showError("username") && !!errors.username
                          }
                        />
                        {showError("username") && (
                          <FieldError errors={[errors.username]} />
                        )}
                      </Field>
                      <Field
                        data-invalid={
                          showError("password") && !!errors.password
                        }
                      >
                        <FieldLabel htmlFor="source-password">
                          Password
                        </FieldLabel>
                        <Input
                          id="source-password"
                          {...register("password", {
                            required: editing
                              ? false
                              : "Password is required",
                          })}
                          type="password"
                          placeholder={editing ? "(unchanged)" : ""}
                          readOnly={locked}
                          aria-invalid={
                            showError("password") && !!errors.password
                          }
                        />
                        {showError("password") && (
                          <FieldError errors={[errors.password]} />
                        )}
                      </Field>
                    </>
                  )}
                  {authType === "bearer" && (
                    <Field data-invalid={showError("token") && !!errors.token}>
                      <FieldLabel htmlFor="source-token">Token</FieldLabel>
                      <Input
                        id="source-token"
                        {...register("token", {
                          required: editing ? false : "Token is required",
                        })}
                        type="password"
                        placeholder={editing ? "(unchanged)" : ""}
                        readOnly={locked}
                        aria-invalid={showError("token") && !!errors.token}
                      />
                      {showError("token") && (
                        <FieldError errors={[errors.token]} />
                      )}
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
                onClick={handleSubmit(async (data) => {
                  if (!selected) return;
                  const body = toCreateBody(selected.id, data);
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
                })}
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
              {!locked && (
                <Button
                  type="submit"
                  disabled={submitting || (!!editing && !isDirty)}
                >
                  {submitting
                    ? editing
                      ? "Saving..."
                      : "Adding..."
                    : editing
                      ? "Save"
                      : "Add source"}
                </Button>
              )}
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
