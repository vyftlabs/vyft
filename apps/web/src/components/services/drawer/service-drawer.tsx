import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Resource, ResourceCreate, ResourceUpdate } from "@vyft/spec";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Control,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";

type ResourceData = Resource;

import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { AddVariableDialog } from "@/components/add-variable-dialog";
import {
  GeneralForm,
  type GeneralFormValues,
  HealthForm,
  type HealthFormValues,
  RoutesForm,
  ScalingForm,
  type ScalingFormValues,
  type ServiceFormValues,
  Variables,
  VariablesSection,
  type VolumeFormEntry,
} from "@/components/services/form";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";
import { ServiceIcon } from "../node";
import { type DrawerTab, Overview, ServiceDrawerShell } from ".";
import type { TimelineEntry } from "./timeline";

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

function VolumesFormSectionWrapper({
  control,
}: {
  control: Control<ServiceFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "volumes",
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-3">
      {fields.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mount path</TableHead>
              <TableHead className="w-16">Size</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
              <TableRow key={field.id} className="group">
                <TableCell className="font-mono text-xs">
                  {field.name}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {field.mountPath}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {field.size}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(index)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setDialogOpen(true)}
      >
        <PlusIcon />
        Add volume
      </Button>

      <AddVolumeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={(vol) => append(vol)}
      />
    </div>
  );
}

function RoutesFormWrapper({
  control,
}: {
  control: Control<ServiceFormValues>;
}) {
  const { fields, replace } = useFieldArray({ control, name: "routes" });
  const port = useWatch({ control, name: "port" });
  const defaultPort = parseInt(port, 10) || 8080;

  return (
    <RoutesForm
      routes={fields.map((f) => ({ ...f, pathType: f.pathType ?? "prefix" }))}
      onChange={(routes) => replace(routes)}
      defaultPort={defaultPort}
    />
  );
}

const settingsSections = [
  { id: "source", label: "Source" },
  { id: "variables", label: "Variables" },
  { id: "volumes", label: "Volumes" },
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
  createProps?: { onCreated: (id: string) => void };
  onClose?: () => void;
}) {
  const isCreating = !resource;
  const app = resource?.service?.app;

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<ServiceFormValues>({
    defaultValues: {
      name: resource?.name ?? "",
      image: app?.source?.image ?? "",
      port: String(app?.port ?? 8080),
      command: app?.command ?? "",
      replicas: String(app?.replicas ?? 1),
      cpuRequest: app?.compute?.cpuRequest ?? "100m",
      cpuLimit: app?.compute?.cpuLimit ?? "500m",
      memoryRequest: app?.compute?.memoryRequest ?? "128Mi",
      memoryLimit: app?.compute?.memoryLimit ?? "512Mi",
      healthCheckType: app?.healthCheck?.type ?? "none",
      healthCheckPath:
        app?.healthCheck?.type === "http"
          ? (app.healthCheck.path ?? "/health")
          : "/health",
      healthCheckPort:
        app?.healthCheck?.type === "http" || app?.healthCheck?.type === "tcp"
          ? String(app.healthCheck.port ?? "")
          : "",
      healthCheckCommand:
        app?.healthCheck?.type === "exec"
          ? (app.healthCheck.command ?? "")
          : "",
      variables: [],
      volumes: [],
      routes: [],
    },
  });

  useEffect(() => {
    if (resource) {
      const a = resource.service?.app;
      reset({
        name: resource.name,
        image: a?.source?.image ?? "",
        port: String(a?.port ?? 8080),
        command: a?.command ?? "",
        replicas: String(a?.replicas ?? 1),
        cpuRequest: a?.compute?.cpuRequest ?? "100m",
        cpuLimit: a?.compute?.cpuLimit ?? "500m",
        memoryRequest: a?.compute?.memoryRequest ?? "128Mi",
        memoryLimit: a?.compute?.memoryLimit ?? "512Mi",
        healthCheckType: a?.healthCheck?.type ?? "none",
        healthCheckPath:
          a?.healthCheck?.type === "http"
            ? (a.healthCheck.path ?? "/health")
            : "/health",
        healthCheckPort:
          a?.healthCheck?.type === "http" || a?.healthCheck?.type === "tcp"
            ? String(a.healthCheck.port ?? "")
            : "",
        healthCheckCommand:
          a?.healthCheck?.type === "exec" ? (a.healthCheck.command ?? "") : "",
        variables: [],
        volumes: [],
        routes: [],
      });
    }
  }, [resource, reset]);

  const updateResource = useMutation({
    ...api.resources.update,
    onError: (err: Error) => toast.error(err.message),
  });

  const createResource = useMutation({
    ...api.resources.create,
    onError: (err: Error) => toast.error(err.message),
  });

  const onSubmit = useCallback((data: ServiceFormValues) => {
    const source = { type: "image" as const, image: data.image.trim() };

    const healthCheck =
      data.healthCheckType === "none"
        ? { type: "none" as const }
        : data.healthCheckType === "http"
          ? {
              type: "http" as const,
              path: data.healthCheckPath || "/health",
              port: data.healthCheckPort
                ? parseInt(data.healthCheckPort, 10)
                : undefined,
            }
          : data.healthCheckType === "tcp"
            ? { type: "tcp" as const, port: parseInt(data.healthCheckPort, 10) }
            : { type: "exec" as const, command: data.healthCheckCommand };

    const compute = {
      cpuRequest: data.cpuRequest,
      cpuLimit: data.cpuLimit,
      memoryRequest: data.memoryRequest,
      memoryLimit: data.memoryLimit,
    };

    if (isCreating && createProps) {
      const body: ResourceCreate = {
        type: "service",
        name: data.name.trim(),
        positionX: 0,
        positionY: 0,
        source,
        port: data.port ? parseInt(data.port, 10) : undefined,
        command: data.command.trim() || undefined,
        replicas: parseInt(data.replicas, 10),
        compute,
        healthCheck,
        variables: data.variables
          .filter((v) => v.key.trim())
          .map((v) => ({
            key: v.key.trim(),
            value: v.value || undefined,
            sensitive: v.secret ?? false,
            sourceVariableId: v.sourceVariableId,
          })),
        volumes: data.volumes
          .filter((v) => v.name.trim() && v.mountPath.trim())
          .map((v) => ({
            name: v.name.trim(),
            size: v.size,
            mountPath: v.mountPath.trim(),
          })),
        routes: data.routes
          .filter((r) => r.domain.trim())
          .map((r) => ({
            domain: r.domain.trim(),
            path: r.path || "/",
            pathType: r.pathType as "prefix" | "exact",
            port: r.port || parseInt(data.port, 10) || 8080,
            tls: r.tls,
          })),
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
      const body: ResourceUpdate = {
        source,
        port: data.port ? parseInt(data.port, 10) : null,
        command: data.command.trim() || null,
        replicas: parseInt(data.replicas, 10),
        compute,
        healthCheck,
      };
      updateResource.mutate({ projectId, id: resource.id, body });
    }
  }, [createProps, createResource, isCreating, projectId, resource, updateResource]);

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

  useEffect(() => {
    if (isCreating || !resource || !isDirty) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => submitRef.current(), 800);
    return () => clearTimeout(autoSaveTimer.current);
  }, [isCreating, isDirty, resource]);

  // Flush pending auto-save on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
        submitRef.current();
      }
    };
  }, []);

  const visibleSections = useMemo(() => settingsSections.filter((s) => {
    if (s.id === "variables") return isCreating;
    if (s.id === "danger") return !!resource;
    return true;
  }), [isCreating, resource]);

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
              <GeneralForm
                control={control as unknown as Control<GeneralFormValues>}
                showName={isCreating}
              />
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

            <div id="volumes" className="space-y-5 scroll-mt-6">
              <SectionHeader
                title="Volumes"
                description="Data persists across restarts and deployments"
              />
              {resource?.service ? (
                <VolumesSection
                  serviceId={resource.service.id}
                  projectId={projectId}
                />
              ) : (
                <VolumesFormSectionWrapper control={control} />
              )}
            </div>

            <div id="resources" className="space-y-5 scroll-mt-6">
              <SectionHeader
                title="Resources"
                description="Service is restarted when limits are exceeded"
              />
              <ScalingForm
                control={control as unknown as Control<ScalingFormValues>}
              />
            </div>

            <div id="health" className="space-y-5 scroll-mt-6">
              <SectionHeader
                title="Health check"
                description="Determines when to restart unhealthy containers"
              />
              <HealthForm
                control={control as unknown as Control<HealthFormValues>}
              />
            </div>

            <div id="routes" className="space-y-5 scroll-mt-6">
              <SectionHeader
                title="Routes"
                description="Expose this service to the internet"
              />
              {isCreating ? (
                <RoutesFormWrapper control={control} />
              ) : resource?.service ? (
                <RoutesSection
                  serviceId={resource.service.id}
                  projectId={projectId}
                />
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

function VolumesSection({
  serviceId,
  projectId,
}: {
  serviceId: string;
  projectId: string;
}) {
  const { data: volumeList = [] } = useQuery({
    ...api.volumes.list(projectId, serviceId),
    enabled: !!serviceId,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: api.volumes.list(projectId, serviceId).queryKey,
    });
    queryClient.invalidateQueries({ queryKey: ["resources"] });
    queryClient.invalidateQueries({
      queryKey: api.deployments.checksum(projectId).queryKey,
    });
  };

  const addVolume = useMutation(api.volumes.create);

  const deleteVolume = useMutation(api.volumes.remove);

  return (
    <div className="space-y-3">
      {volumeList.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mount path</TableHead>
              <TableHead className="w-16">Size</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {volumeList.map((vol: (typeof volumeList)[number]) => (
              <TableRow key={vol.id} className="group">
                <TableCell className="font-mono text-xs">{vol.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {vol.mountPath}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {vol.size}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    disabled={deleteVolume.isPending}
                    onClick={() =>
                      deleteVolume.mutate(
                        { projectId, id: vol.id },
                        {
                          onSuccess: invalidate,
                          onError: (err: Error) => toast.error(err.message),
                        },
                      )
                    }
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setDialogOpen(true)}
      >
        <PlusIcon />
        Add volume
      </Button>

      <AddVolumeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={(vol) =>
          addVolume.mutate(
            {
              projectId,
              serviceId,
              body: {
                name: vol.name,
                size: vol.size,
                mountPath: vol.mountPath,
              },
            },
            {
              onSuccess: invalidate,
              onError: (err: Error) => toast.error(err.message),
            },
          )
        }
      />
    </div>
  );
}

function AddVolumeDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (vol: VolumeFormEntry) => void;
}) {
  const [name, setName] = useState("");
  const [size, setSize] = useState("1Gi");
  const [mountPath, setMountPath] = useState("");

  const cleanup = () => {
    setName("");
    setSize("1Gi");
    setMountPath("");
    onOpenChange(false);
  };

  const handleAdd = () => {
    if (!name.trim() || !mountPath.trim()) return;
    onAdd({ name: name.trim(), size, mountPath: mountPath.trim() });
    cleanup();
  };

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
            <DialogTitle>Add volume</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Field>
              <FieldLabel htmlFor="vol-name">Name</FieldLabel>
              <Input
                id="vol-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="data"
                autoFocus
              />
            </Field>

            {(() => {
              const volSteps = [
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50, 75, 100,
                150, 200, 300, 400, 500, 750, 1000,
              ];
              const sizeNum = parseInt(size, 10) || 1;
              const closest = volSteps.reduce(
                (a, b) =>
                  Math.abs(b - sizeNum) < Math.abs(a - sizeNum) ? b : a,
                volSteps[0] ?? 1,
              );
              const currentIdx = volSteps.indexOf(closest);
              const currentVal = volSteps[currentIdx] ?? 1;
              return (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="vol-size">Size</FieldLabel>
                    <span className="text-sm text-muted-foreground font-mono">
                      {currentVal >= 1000
                        ? `${currentVal / 1000}Ti`
                        : `${currentVal}Gi`}
                    </span>
                  </div>
                  <Slider
                    id="vol-size"
                    value={[currentIdx]}
                    onValueChange={([i]) => {
                      const v = i !== undefined ? volSteps[i] : undefined;
                      if (v) setSize(`${v}Gi`);
                    }}
                    min={0}
                    max={volSteps.length - 1}
                    step={1}
                  />
                </div>
              );
            })()}

            <Field>
              <FieldLabel htmlFor="vol-mount">Mount path</FieldLabel>
              <Input
                id="vol-mount"
                value={mountPath}
                onChange={(e) => setMountPath(e.target.value)}
                placeholder="/data"
                className="font-mono"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={!name.trim() || !mountPath.trim()}
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
  serviceId,
  projectId,
}: {
  serviceId: string;
  projectId: string;
}) {
  const { data: routeList = [] } = useQuery({
    ...api.routes.list(projectId, serviceId),
    enabled: !!serviceId,
  });
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: api.routes.list(projectId, serviceId).queryKey,
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
                serviceId,
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

  type Suggestion = import("@/components/variable-form").VariableSuggestion;
  type Group = import("@/components/variable-form").SuggestionGroup;
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
            secret: v.sensitive,
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
  createProps?: { onCreated: (id: string) => void },
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
    isCreating ? { onCreated: (id: string) => onCreated?.(id) } : undefined,
    onClose,
  );

  if (!isOpen) return null;

  const image = resource?.service?.app?.source?.image;

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
              data-testid="service-create-submit"
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
