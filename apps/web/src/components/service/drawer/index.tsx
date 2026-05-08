import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type DiskCreate,
  type Resource,
  ServiceAppCreate,
} from "@vyft/spec";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Control,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { toast } from "sonner";
import {
  DisksFormSection,
  fromResource,
  GeneralForm,
  HealthForm,
  RoutesForm,
  ScalingForm,
  toResourceUpdate,
  Variables,
  VariablesSection,
} from "@/components/service/form";
import { Button } from "@/components/ui/button";
import { DangerZone } from "@/components/ui/danger-zone";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { AddVariableDialog } from "@/components/variable/add";
import * as api from "@/lib/api";
import { getAppSpec } from "@/lib/resource";
import { cn } from "@/lib/utils";
import { ServiceIcon } from "../node";
import { type DrawerTab, Overview, ServiceDrawerShell } from "./shell";
import type { TimelineEntry } from "./timeline";

type ResourceData = Resource;

function OverviewTab({
  resourceId,
  projectId,
}: {
  resourceId: string;
  projectId: string;
  project: string;
}) {
  const { data: events = [] } = useQuery({
    ...api.observability.events(projectId, resourceId),
    enabled: !!resourceId,
    refetchInterval: 5000,
  });

  const { data: logs = [] } = useQuery({
    ...api.observability.logs(projectId, resourceId, 50),
    enabled: !!resourceId,
    refetchInterval: 5000,
  });

  const { data: metrics } = useQuery({
    ...api.observability.metrics(projectId, resourceId),
    enabled: !!resourceId,
    refetchInterval: 10000,
  });

  const timeline: TimelineEntry[] = events.map(
    (e: (typeof events)[number]) => ({
      kind: "event",
      event: {
        id: e.id,
        type: e.type,
        reason: e.reason,
        message: e.message,
        timestamp: e.timestamp,
      },
    }),
  );

  return (
    <Overview
      sparklines={[
        [
          {
            title: "Requests",
            data: metrics?.reqRate ?? [],
            dataKey: "value",
            unit: "/s",
          },
          {
            title: "Error rate",
            data: metrics?.errRate ?? [],
            dataKey: "value",
            unit: "%",
          },
        ],
        [
          {
            title: "CPU",
            data: metrics?.cpu ?? [],
            dataKey: "value",
            unit: "%",
          },
          {
            title: "Memory",
            data: metrics?.memory ?? [],
            dataKey: "value",
            unit: "Mi",
          },
        ],
      ]}
      latency={{
        data: metrics?.latency ?? [],
        keys: [
          { dataKey: "p99", label: "P99" },
          { dataKey: "p95", label: "P95" },
          { dataKey: "p50", label: "P50" },
        ],
      }}
      timeline={timeline}
      logs={logs}
    />
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="border-b pb-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && (
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      )}
    </div>
  );
}

function DisksFormSectionWrapper({
  control,
}: {
  control: Control<ServiceAppCreate>;
}) {
  const { append } = useFieldArray({ control, name: "service.spec.disks" });
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <DisksFormSection
      control={control}
      onAdd={() => setDialogOpen(true)}
      addDialog={
        <AddDiskDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onAdd={(disk) => append(disk)}
        />
      }
    />
  );
}

function RoutesFormWrapper({
  control,
}: {
  control: Control<ServiceAppCreate>;
}) {
  const { fields, replace } = useFieldArray({
    control,
    name: "service.spec.routes",
  });
  const port = useWatch({ control, name: "service.spec.port" });

  return (
    <RoutesForm
      routes={fields.map((f) => ({
        domain: f.domain,
        path: f.path,
        pathType: f.pathType,
        port: f.port,
        tls: f.tls,
        config: f.config,
      }))}
      onChange={(routes) => replace(routes)}
      defaultPort={Number.isFinite(port) ? port : 8080}
    />
  );
}

const settingsSections = [
  { id: "source", label: "Source" },
  { id: "variables", label: "Variables" },
  { id: "disks", label: "Disks" },
  { id: "resources", label: "Resources" },
  { id: "health", label: "Health check" },
  { id: "routes", label: "Routes" },
  { id: "danger", label: "Danger" },
];

function SettingsTab({
  resource,
  projectId,
  createProps,
  onClose,
}: {
  resource?: ResourceData;
  project: string;
  projectId: string;
  createProps?: {
    onCreated: (id: string) => void;
    position?: { x: number; y: number };
  };
  onClose?: () => void;
}) {
  const isCreating = !resource;

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<ServiceAppCreate>({
    resolver: zodResolver(ServiceAppCreate),
    defaultValues: fromResource(resource),
  });

  useEffect(() => {
    if (resource) reset(fromResource(resource));
  }, [resource, reset]);

  const updateResource = useMutation({
    ...api.resources.update,
    onError: (err: Error) => toast.error(err.message),
  });

  const createResource = useMutation({
    ...api.resources.create,
    onError: (err: Error) => toast.error(err.message),
  });

  const onSubmit = useCallback(
    (data: ServiceAppCreate) => {
      if (isCreating && createProps) {
        const body: ServiceAppCreate = {
          ...data,
          name: data.name.trim(),
          positionX: createProps.position?.x ?? 0,
          positionY: createProps.position?.y ?? 0,
        };
        createResource.mutate(
          { projectId, body },
          {
            onSuccess: (created) => {
              createProps.onCreated(created.id);
            },
          },
        );
      } else if (resource) {
        const body = toResourceUpdate(data);
        updateResource.mutate(
          { projectId, id: resource.id, body },
          {
            // Reset dirty state so subsequent edits re-arm autosave
            onSuccess: () => reset(data, { keepValues: true }),
          },
        );
      }
    },
    [
      createProps,
      createResource,
      isCreating,
      projectId,
      reset,
      resource,
      updateResource,
    ],
  );

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const submit = useCallback(
    () => handleSubmit(onSubmit)(),
    [handleSubmit, onSubmit],
  );
  const submitRef = useRef(submit);

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // Debounce autosave on every form value change while dirty
  const watchedValues = useWatch({ control });

  // biome-ignore lint/correctness/useExhaustiveDependencies: watchedValues drives debounced re-runs
  useEffect(() => {
    if (isCreating || !resource || !isDirty) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => submitRef.current(), 800);
    return () => clearTimeout(autoSaveTimer.current);
  }, [isCreating, isDirty, resource, watchedValues]);

  // Flush pending auto-save on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
        submitRef.current();
      }
    };
  }, []);

  const visibleSections = useMemo(
    () =>
      settingsSections.filter((s) => {
        if (s.id === "variables") return isCreating;
        if (s.id === "danger") return !!resource;
        return true;
      }),
    [isCreating, resource],
  );

  const [activeSection, setActiveSection] = useState(
    visibleSections[0]?.id ?? "",
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const viewport =
      container.closest("[data-slot='scroll-area-viewport']") ?? container;

    const sectionEls = visibleSections
      .map((s) => container.querySelector<HTMLElement>(`#${s.id}`))
      .filter(Boolean) as HTMLElement[];

    const handleScroll = () => {
      const atBottom =
        Math.abs(
          viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
        ) < 2;
      if (atBottom && sectionEls.length > 0) {
        const last = sectionEls[sectionEls.length - 1];
        if (last) setActiveSection(last.id);
        return;
      }
      const viewportTop = viewport.getBoundingClientRect().top;
      let active = sectionEls[0]?.id ?? visibleSections[0]?.id ?? "";
      for (const el of sectionEls) {
        if (el.getBoundingClientRect().top - viewportTop <= 25) {
          active = el.id;
        }
      }
      setActiveSection(active);
    };

    handleScroll();
    viewport.addEventListener("scroll", handleScroll, { passive: true });

    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [visibleSections]);

  const scrollTo = (id: string) => {
    const el = scrollRef.current?.querySelector(`#${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <ScrollArea className="h-full -mr-6">
      <div ref={scrollRef} className="flex gap-16 pb-[40vh]">
        <div className="flex-1 space-y-12">
          <form
            id={isCreating ? "create-service-form" : undefined}
            className="space-y-12"
            onSubmit={handleSubmit(onSubmit)}
          >
            <div id="source" className="space-y-5 scroll-mt-6">
              <SectionHeader
                title="Source"
                description={
                  isCreating
                    ? "Where to deploy from"
                    : "Changes trigger a new deployment"
                }
              />
              <GeneralForm control={control} showName={isCreating} />
            </div>

            {isCreating && (
              <div id="variables" className="space-y-5 scroll-mt-6">
                <SectionHeader
                  title="Variables"
                  description="Environment variables passed to the container"
                />
                <VariablesSection control={control} projectId={projectId} />
              </div>
            )}

            <div id="disks" className="space-y-5 scroll-mt-6">
              <SectionHeader
                title="Disks"
                description="Data persists across restarts and deployments"
              />
              <DisksFormSectionWrapper control={control} />
            </div>

            <div id="resources" className="space-y-5 scroll-mt-6">
              <SectionHeader
                title="Resources"
                description="Service is restarted when limits are exceeded"
              />
              <ScalingForm control={control} />
            </div>

            <div id="health" className="space-y-5 scroll-mt-6">
              <SectionHeader
                title="Health check"
                description="Determines when to restart unhealthy containers"
              />
              <HealthForm control={control} />
            </div>

            <div id="routes" className="space-y-5 scroll-mt-6">
              <SectionHeader
                title="Routes"
                description="Expose this service to the internet"
              />
              {isCreating ? (
                <RoutesFormWrapper control={control} />
              ) : resource ? (
                <RoutesSection resourceId={resource.id} projectId={projectId} />
              ) : null}
            </div>
          </form>

          {resource && (
            <div id="danger" className="space-y-5 scroll-mt-6">
              <DangerSection
                resourceId={resource.id}
                projectId={projectId}
                onClose={onClose}
              />
            </div>
          )}
        </div>

        <nav className="w-28 shrink-0 sticky top-6 self-start pr-4">
          <ul>
            {visibleSections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => scrollTo(s.id)}
                  data-testid={`service.drawer.section.${s.id}`}
                  className={cn(
                    "block w-full text-left text-xs py-1 transition-colors",
                    activeSection === s.id
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </ScrollArea>
  );
}

const DISK_GIB_STEPS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300,
  400, 500, 750, 1000,
];
const DEFAULT_DISK_MB = 1024;

function closestDiskIndex(mb: number): number {
  const gib = mb / 1024;
  let best = 0;
  for (let i = 0; i < DISK_GIB_STEPS.length; i++) {
    if (
      Math.abs((DISK_GIB_STEPS[i] ?? 0) - gib) <
      Math.abs((DISK_GIB_STEPS[best] ?? 0) - gib)
    )
      best = i;
  }
  return best;
}

function AddDiskDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (disk: DiskCreate) => void;
}) {
  const [name, setName] = useState("");
  const [size, setSize] = useState<number>(DEFAULT_DISK_MB);
  const [path, setPath] = useState("");

  const cleanup = () => {
    setName("");
    setSize(DEFAULT_DISK_MB);
    setPath("");
    onOpenChange(false);
  };

  const handleAdd = () => {
    if (!name.trim() || !path.trim()) return;
    onAdd({ name: name.trim(), size, path: path.trim() });
    cleanup();
  };

  const currentIdx = closestDiskIndex(size);
  const currentGib = DISK_GIB_STEPS[currentIdx] ?? 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) cleanup();
        else onOpenChange(v);
      }}
    >
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
        >
          <DialogHeader>
            <DialogTitle>Add disk</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Field>
              <FieldLabel htmlFor="disk-name">Name</FieldLabel>
              <Input
                id="disk-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="data"
                autoFocus
                data-testid="service.form.disks.dialog.name"
              />
            </Field>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="disk-size">Size</FieldLabel>
                <span className="text-sm text-muted-foreground font-mono">
                  {currentGib >= 1000
                    ? `${currentGib / 1000}Ti`
                    : `${currentGib}Gi`}
                </span>
              </div>
              <Slider
                id="disk-size"
                value={[currentIdx]}
                onValueChange={([i]) => {
                  if (i === undefined) return;
                  const gib = DISK_GIB_STEPS[i];
                  if (gib !== undefined) setSize(gib * 1024);
                }}
                min={0}
                max={DISK_GIB_STEPS.length - 1}
                step={1}
              />
            </div>

            <Field>
              <FieldLabel htmlFor="disk-path">Path</FieldLabel>
              <Input
                id="disk-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/data"
                className="font-mono"
                data-testid="service.form.disks.dialog.path"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={!name.trim() || !path.trim()}
              data-testid="service.form.disks.dialog.submit"
            >
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoutesSection({
  resourceId,
  projectId,
}: {
  resourceId: string;
  projectId: string;
}) {
  const { data: routeList = [] } = useQuery({
    ...api.routes.list(projectId, resourceId),
    enabled: !!resourceId,
  });
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: api.routes.list(projectId, resourceId).queryKey,
    });
    queryClient.invalidateQueries({ queryKey: ["resources"] });
    queryClient.invalidateQueries({
      queryKey: api.deployments.checksum(projectId).queryKey,
    });
  };

  const createRoute = useMutation(api.routes.create);

  const deleteRoute = useMutation(api.routes.remove);

  return (
    <RoutesForm
      routes={routeList.map((r: (typeof routeList)[number]) => ({
        domain: r.domain,
        path: r.path,
        pathType: r.pathType || "prefix",
        port: r.port,
        tls: r.tls,
      }))}
      onChange={(newRoutes) => {
        if (newRoutes.length > routeList.length) {
          const added = newRoutes.at(-1);
          if (added) {
            createRoute.mutate(
              {
                projectId,
                resourceId,
                body: {
                  domain: added.domain,
                  path: added.path,
                  pathType: added.pathType as "prefix" | "exact",
                  port: added.port,
                  tls: added.tls,
                },
              },
              {
                onSuccess: invalidate,
                onError: (err: Error) => toast.error(err.message),
              },
            );
          }
        }
        if (newRoutes.length < routeList.length) {
          const removed = routeList.find(
            (rt: (typeof routeList)[number]) =>
              !newRoutes.some(
                (n) => n.domain === rt.domain && n.path === rt.path,
              ),
          );
          if (removed) {
            deleteRoute.mutate(
              { projectId, id: removed.id },
              {
                onSuccess: invalidate,
                onError: (err: Error) => toast.error(err.message),
              },
            );
          }
        }
      }}
    />
  );
}

function DangerSection({
  resourceId,
  projectId,
  onClose,
}: {
  resourceId: string;
  projectId: string;
  onClose?: () => void;
}) {
  const deleteResource = useMutation(api.resources.remove);

  return (
    <DangerZone
      title="Delete service"
      description="Permanently remove this service and all its resources. This action cannot be undone."
      action="Delete service"
      testIdPrefix="service.danger.delete"
      onAction={() =>
        deleteResource.mutate(
          { projectId, id: resourceId },
          {
            onSuccess: () => onClose?.(),
            onError: (err: Error) => toast.error(err.message),
          },
        )
      }
      disabled={deleteResource.isPending}
    />
  );
}

function useVariableSuggestionGroups(
  projectId: string,
  excludeResourceId?: string,
) {
  const { data } = useQuery({
    ...api.variables.suggestions(projectId, { excludeResourceId }),
    enabled: !!projectId,
  });

  if (!data) return [];

  type Suggestion = import("@/components/variable/form").VariableSuggestion;
  type Group = import("@/components/variable/form").SuggestionGroup;
  const groups: Group[] = [];

  if (data.shared.length > 0) {
    groups.push({ label: "Shared", items: data.shared });
  }

  // Merge built-ins and user-defined service vars under each owning service.
  const byService = new Map<string, { items: Suggestion[]; image?: string }>();
  const ensure = (name: string, image?: string) => {
    let entry = byService.get(name);
    if (!entry) {
      entry = { items: [], image };
      byService.set(name, entry);
    } else if (!entry.image && image) {
      entry.image = image;
    }
    return entry;
  };
  for (const b of data.builtin ?? []) {
    ensure(b.resourceName ?? "Unknown", b.resourceImage).items.push(b);
  }
  for (const v of data.service) {
    ensure(v.resourceName ?? "Unknown", v.resourceImage).items.push(v);
  }

  for (const [name, { items, image }] of byService) {
    groups.push({ label: name, image, items });
  }

  return groups;
}

function VariablesTab({
  resourceId,
  project,
  projectId,
}: {
  resourceId: string;
  project: string;
  projectId: string;
}) {
  const { data: rawVars = [] } = useQuery({
    ...api.variables.list(projectId, { resourceId }),
    enabled: !!resourceId,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const existingKeys = new Set(rawVars.map((v) => v.key));
  const existingSourceIds = new Set(
    rawVars.filter((v) => v.sourceVariableId).map((v) => v.sourceVariableId),
  );
  const suggestionGroups = useVariableSuggestionGroups(projectId, resourceId)
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (s) => !existingKeys.has(s.key) && !existingSourceIds.has(s.id),
      ),
    }))
    .filter((g) => g.items.length > 0);

  const deleteVar = useMutation(api.variables.remove);

  return (
    <div>
      <Variables
        variables={rawVars.map((v) => {
          const source = "source" in v ? v.source : null;
          return {
            key: v.key,
            value: v.value ?? "",
            secret: v.secret,
            sourceVariableId: v.sourceVariableId ?? undefined,
            sourceKey: source?.key,
            sourceResourceName: source?.resource?.name,
          };
        })}
        onDelete={(key) => {
          const variable = rawVars.find((v) => v.key === key);
          if (variable) deleteVar.mutate({ projectId, id: variable.id });
        }}
      >
        <Variables.List />
        <Variables.AddButton onClick={() => setDialogOpen(true)} />
      </Variables>
      <AddVariableDialog
        project={project}
        projectId={projectId}
        resourceId={resourceId}
        suggestionGroups={suggestionGroups}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

function useServiceDrawerTabs(
  resource: ResourceData | undefined,
  project: string,
  projectId: string,
  createProps?: {
    onCreated: (id: string) => void;
    position?: { x: number; y: number };
  },
  onClose?: () => void,
): { tabs: DrawerTab[]; defaultTab: string } {
  const isCreating = !resource;

  if (isCreating) {
    return {
      defaultTab: "settings",
      tabs: [
        {
          id: "settings",
          label: "Settings",
          content: (
            <SettingsTab
              project={project}
              projectId={projectId}
              createProps={createProps}
            />
          ),
        },
      ],
    };
  }

  return {
    defaultTab: "overview",
    tabs: [
      {
        id: "overview",
        label: "Overview",
        content: (
          <OverviewTab
            resourceId={resource.id}
            projectId={projectId}
            project={project}
          />
        ),
      },
      {
        id: "variables",
        label: "Variables",
        content: (
          <VariablesTab
            resourceId={resource.id}
            project={project}
            projectId={projectId}
          />
        ),
      },
      {
        id: "settings",
        label: "Settings",
        content: (
          <SettingsTab
            resource={resource}
            project={project}
            projectId={projectId}
            onClose={onClose}
          />
        ),
      },
    ],
  };
}

export function ServiceDrawer({
  resourceId,
  creating,
  createPosition,
  project,
  projectId,
  skipEntryAnimation,
  expanded,
  expandedContent,
  onClose,
  onCreated,
}: {
  resourceId: string | null;
  creating?: boolean;
  createPosition?: { x: number; y: number };
  project: string;
  projectId: string;
  skipEntryAnimation?: boolean;
  expanded?: boolean;
  expandedContent?: React.ReactNode;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const isOpen = !!resourceId || !!creating;
  const isCreating = !resourceId && !!creating;

  const { data: resource } = useQuery({
    ...api.resources.byId(projectId, resourceId ?? ""),
    enabled: !!resourceId,
  });

  const drawerName = isCreating
    ? "New service"
    : (resource?.name ?? "New service");
  const { tabs, defaultTab } = useServiceDrawerTabs(
    resource ?? undefined,
    project,
    projectId,
    isCreating
      ? {
          onCreated: (id: string) => onCreated?.(id),
          position: createPosition,
        }
      : undefined,
    onClose,
  );

  if (!isOpen) return null;

  const image = resource ? getAppSpec(resource)?.source.image : undefined;

  return (
    <ServiceDrawerShell
      name={drawerName}
      icon={resource ? <ServiceIcon image={image} /> : undefined}
      tabs={tabs}
      defaultTab={defaultTab}
      footer={
        isCreating ? (
          <div className="flex justify-end px-6 py-3 border-t bg-muted/50 shrink-0">
            <Button
              size="sm"
              type="submit"
              form="create-service-form"
              data-testid="service.drawer.create-submit"
            >
              Create
            </Button>
          </div>
        ) : undefined
      }
      skipEntryAnimation={skipEntryAnimation}
      expanded={expanded}
      expandedContent={expandedContent}
      onClose={onClose}
    />
  );
}
