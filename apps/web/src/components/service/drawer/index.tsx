import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type Deployment,
  type DiskCreate,
  type Resource,
  ResourceAppCreate,
} from "@vyft/spec";
import { SiPostgresql, SiRedis } from "@icons-pack/react-simple-icons";
import { LoaderIcon, MoreHorizontalIcon, RotateCcwIcon } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DangerZone } from "@/components/ui/danger-zone";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { AddVariableDialog } from "@/components/variable/add";
import * as api from "@/lib/api";
import { describeDeploymentChange } from "@/lib/deployment-change";
import { getAppSpec } from "@/lib/resource";
import { type CurrentUser, useCurrentUser, userInitials } from "@/lib/user";
import { cn } from "@/lib/utils";
import { LogsPanel } from "../logs/panel";
import { MetricsGrid } from "../metrics/grid";
import {
  DEFAULT_METRICS_WINDOW_MS,
  MetricsTab,
  RangeSelector,
} from "../metrics/tab";
import { ServiceIcon } from "../node";
import { BackupsTab } from "./backups-tab";
import { DeploymentDetail } from "./deployment-detail";
import { EventsTab } from "./events-tab";
import { PostgresSettings } from "./postgres-settings";
import { RedisSettings } from "./redis-settings";
import { type DrawerTab, Overview, ServiceDrawerShell } from "./shell";
import { formatDuration, timeAgo } from "./timeline";

type ResourceData = Resource;

function OverviewTab({
  resourceId,
  projectId,
  onOpenDeployment,
}: {
  resourceId: string;
  projectId: string;
  project: string;
  onOpenDeployment: (id: string) => void;
}) {
  return (
    <Overview
      metricsArea={
        <MetricsGrid projectId={projectId} resourceId={resourceId} />
      }
      logsArea={<LogsPanel projectId={projectId} resourceId={resourceId} />}
      deploymentsArea={
        <RecentDeployments
          projectId={projectId}
          resourceId={resourceId}
          onSelect={onOpenDeployment}
        />
      }
    />
  );
}


// Minimal: status word is the title (in-progress gets an animated spinner),
// hash sits beside it in a lower shade. Color is reserved for failure.
const deploymentStatusLabel: Record<Deployment["status"], string> = {
  pending: "Queued",
  applying: "Deploying",
  applied: "Deployed",
  failed: "Failed",
};

function deploymentRefetchInterval(query: {
  state: { data?: Deployment[] };
}): number | false {
  const status = query.state.data?.[0]?.status;
  return status === "pending" || status === "applying" ? 1000 : false;
}

function DeploymentRow({
  d,
  user,
  detailed,
  label,
  onRestore,
  onSelect,
}: {
  d: Deployment;
  // user + detailed are the full Deployments-tab card: avatar + name on a
  // second line. The compact Overview list omits both.
  user?: CurrentUser;
  detailed?: boolean;
  // label is the inferred change summary ("Scaled to 3", "Updated image",
  // "2 changes") used as the title in the compact list. Falls back to the
  // status word when absent.
  label?: string;
  onRestore?: (d: Deployment) => void;
  // When set, the row's content is clickable and opens the deployment detail.
  onSelect?: (d: Deployment) => void;
}) {
  const duration = formatDuration(d.createdAt, d.appliedAt ?? undefined);
  const failed = d.status === "failed";
  const inProgress = d.status === "pending" || d.status === "applying";
  return (
    <div
      className={cn(
        "group flex gap-2 py-2",
        // Detailed tab uses roomier rows + balances the top: container pt-4
        // (16px) + first-item top == the tab's horizontal padding (px-4=16 /
        // sm:px-6=24), so the first row's top inset matches the sides.
        detailed && "py-3 first:pt-0 sm:first:pt-2",
        onSelect && "px-2 transition-colors hover:bg-muted/50",
      )}
    >
      <div
        className={cn(
          "min-w-0 flex-1",
          onSelect && "cursor-pointer",
        )}
        {...(onSelect && {
          role: "button",
          tabIndex: 0,
          onClick: () => onSelect(d),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(d);
            }
          },
        })}
      >
        <div className="flex items-center gap-1.5">
          {detailed && inProgress && (
            <LoaderIcon className="size-3.5 text-muted-foreground animate-spin shrink-0" />
          )}
          <span
            className={cn(
              "text-sm font-medium leading-none",
              failed && "text-severity-critical-text",
            )}
          >
            {label ?? deploymentStatusLabel[d.status]}
          </span>
          <span className="text-xs font-mono text-muted-foreground/60">
            {d.id.slice(0, 7)}
          </span>
          {!detailed && (
            <>
              {/* Single-user for now — "by You" is a placeholder until
                  Deployment carries a real triggeredBy actor. */}
              <span aria-hidden className="text-muted-foreground/60">
                ·
              </span>
              <span className="text-[11px] text-muted-foreground truncate">
                by You
              </span>
              {duration && (
                <>
                  <span aria-hidden className="text-muted-foreground/60">
                    ·
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {duration}
                  </span>
                </>
              )}
              {inProgress && (
                <LoaderIcon className="size-3.5 text-muted-foreground animate-spin shrink-0 ml-auto" />
              )}
            </>
          )}
        </div>
        {detailed && user && (
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
            <Avatar size="sm" className="size-4 shrink-0">
              {user.avatarUrl && (
                <AvatarImage src={user.avatarUrl} alt={user.name} />
              )}
              <AvatarFallback className="text-[8px]">
                {userInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{user.name}</span>
            {duration && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{duration}</span>
              </>
            )}
          </div>
        )}
        {d.error && (
          <p className="text-[10px] text-severity-critical-text mt-2 leading-snug">
            {d.error}
          </p>
        )}
      </div>
      {/* right column: ⋯ over time, aligned to the same edge */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        {onRestore && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Deployment actions"
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground/50 hover:bg-muted hover:text-foreground transition-colors"
                />
              }
            >
              <MoreHorizontalIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRestore(d)}>
                <RotateCcwIcon className="size-3.5" />
                Restore
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <span
          className="text-xs text-muted-foreground tabular-nums pr-1"
          title={new Date(d.createdAt).toLocaleString()}
        >
          {timeAgo(d.createdAt)}
        </span>
      </div>
    </div>
  );
}

// Compact, read-only recent-deployments list for the Overview tab.
function RecentDeployments({
  resourceId,
  projectId,
  onSelect,
}: {
  resourceId: string;
  projectId: string;
  onSelect: (id: string) => void;
}) {
  const { data: deployments = [] } = useQuery({
    ...api.deployments.listByResource(projectId, resourceId),
    refetchInterval: deploymentRefetchInterval,
  });
  return (
    <div>
      {deployments.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No deployments yet.</p>
      ) : (
        <div className="divide-y">
          {deployments.slice(0, 8).map((d, i) => (
            <DeploymentRow
              key={d.id}
              d={d}
              label={describeDeploymentChange(d, deployments[i + 1], resourceId)}
              onSelect={(dep) => onSelect(dep.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeploymentsTab({
  resourceId,
  projectId,
  selectedId,
  onSelectId,
}: {
  resourceId: string;
  projectId: string;
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
}) {
  const { data: deployments = [] } = useQuery({
    ...api.deployments.listByResource(projectId, resourceId),
    refetchInterval: deploymentRefetchInterval,
  });
  const restore = useMutation(api.deployments.restoreResource);
  const [confirm, setConfirm] = useState<Deployment | null>(null);
  const user = useCurrentUser();

  // Re-resolve the selected deployment from fresh data so its status/error stay
  // live while open; fall back to closing if it disappears.
  const selectedIndex = selectedId
    ? deployments.findIndex((d) => d.id === selectedId)
    : -1;
  const selected = selectedIndex >= 0 ? deployments[selectedIndex] : null;
  if (selected) {
    return (
      <DeploymentDetail
        deployment={selected}
        projectId={projectId}
        resourceId={resourceId}
        title={describeDeploymentChange(
          selected,
          deployments[selectedIndex + 1],
          resourceId,
        )}
        // Only the newest deployment's pods are still running, so only it gets a
        // live log tail; older ones show a static historical view.
        live={selectedIndex === 0}
      />
    );
  }

  if (deployments.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4">
        No deployments yet for this service.
      </p>
    );
  }

  const doRestore = (d: Deployment) => {
    restore.mutate(
      { projectId, resourceId, id: d.id },
      {
        onSuccess: () => {
          toast.success("Deployment restored — deploy to apply.");
          setConfirm(null);
        },
        onError: (err: Error) => toast.error(err.message),
      },
    );
  };

  return (
    <>
      <div className="divide-y">
        {deployments.map((d, i) => (
          <DeploymentRow
            key={d.id}
            d={d}
            user={user}
            detailed
            label={describeDeploymentChange(d, deployments[i + 1], resourceId)}
            onRestore={setConfirm}
            onSelect={(dep) => onSelectId(dep.id)}
          />
        ))}
      </div>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(v) => {
          if (!restore.isPending && !v) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore deployment {confirm?.id.slice(0, 7)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Stages this deployment's image, settings, routes, and variables
              onto the service. You'll need to deploy to apply. Disks and data
              are not affected; secret values aren't restored and must be
              re-entered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restore.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={restore.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirm) doRestore(confirm);
              }}
            >
              {restore.isPending && <Spinner className="size-4" />}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
  control: Control<ResourceAppCreate>;
}) {
  const { append } = useFieldArray({ control, name: "config.spec.disks" });
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
  control: Control<ResourceAppCreate>;
}) {
  const { fields, replace } = useFieldArray({
    control,
    name: "config.spec.routes",
  });
  const port = useWatch({ control, name: "config.spec.port" });

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
  project,
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
    formState: { isDirty, isSubmitted },
  } = useForm<ResourceAppCreate>({
    resolver: zodResolver(ResourceAppCreate),
    defaultValues: fromResource(resource),
    mode: "onSubmit",
    reValidateMode: "onChange",
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
    (data: ResourceAppCreate) => {
      if (isCreating && createProps) {
        const body: ResourceAppCreate = {
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
        if (s.id === "danger") return !!resource;
        return true;
      }),
    [resource],
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
      <div ref={scrollRef} className="flex gap-4 sm:gap-16 pb-[40vh]">
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
                control={control}
                showName={isCreating}
                isSubmitted={isSubmitted}
              />
            </div>

            <div id="variables" className="space-y-5 scroll-mt-6">
              <SectionHeader
                title="Variables"
                description="Environment variables passed to the container"
              />
              {isCreating ? (
                <VariablesSection control={control} projectId={projectId} />
              ) : resource ? (
                <VariablesTab
                  resourceId={resource.id}
                  project={project}
                  projectId={projectId}
                />
              ) : null}
            </div>

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
              <ScalingForm control={control} isSubmitted={isSubmitted} />
            </div>

            <div id="health" className="space-y-5 scroll-mt-6">
              <SectionHeader
                title="Health check"
                description="Determines when to restart unhealthy containers"
              />
              <HealthForm control={control} isSubmitted={isSubmitted} />
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

type DiskFormValues = { name: string; size: number; path: string };

function AddDiskDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (disk: DiskCreate) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitted },
  } = useForm<DiskFormValues>({
    defaultValues: { name: "", size: DEFAULT_DISK_MB, path: "" },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const showError = (field: keyof DiskFormValues): boolean =>
    isSubmitted && !!errors[field];

  useEffect(() => {
    if (open) reset({ name: "", size: DEFAULT_DISK_MB, path: "" });
  }, [open, reset]);

  const size = useWatch({ control, name: "size" });
  const currentIdx = closestDiskIndex(size);
  const currentGib = DISK_GIB_STEPS[currentIdx] ?? 1;

  const onSubmit = handleSubmit((data) => {
    onAdd({ name: data.name.trim(), size: data.size, path: data.path.trim() });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Add disk</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Field data-invalid={showError("name") && !!errors.name}>
              <FieldLabel htmlFor="disk-name">Name</FieldLabel>
              <Input
                id="disk-name"
                {...register("name", {
                  required: "Name is required",
                  validate: (v) => v.trim().length > 0 || "Name is required",
                })}
                placeholder="data"
                autoFocus
                data-testid="service.form.disks.dialog.name"
                aria-invalid={showError("name") && !!errors.name}
              />
              {showError("name") && <FieldError errors={[errors.name]} />}
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
                  if (gib !== undefined) setValue("size", gib * 1024);
                }}
                min={0}
                max={DISK_GIB_STEPS.length - 1}
                step={1}
              />
            </div>

            <Field data-invalid={showError("path") && !!errors.path}>
              <FieldLabel htmlFor="disk-path">Path</FieldLabel>
              <Input
                id="disk-path"
                {...register("path", {
                  required: "Path is required",
                  validate: (v) =>
                    v.trim().startsWith("/") || "Path must start with /",
                })}
                placeholder="/data"
                className="font-mono"
                data-testid="service.form.disks.dialog.path"
                aria-invalid={showError("path") && !!errors.path}
              />
              {showError("path") && <FieldError errors={[errors.path]} />}
            </Field>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="w-full"
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
  const { data: allRoutes = [] } = useQuery({
    ...api.routes.list(projectId),
    enabled: !!resourceId,
  });
  const routeList = allRoutes.filter((r) => r.resourceId === resourceId);
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: api.routes.list(projectId).queryKey,
    });
    queryClient.invalidateQueries({ queryKey: ["resources"] });
    queryClient.invalidateQueries({
      queryKey: api.deployments.list(projectId).queryKey,
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
                body: {
                  resourceId,
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
  // Importable = every project variable except those owned by the resource
  // we're adding to. Groups by source service (or "Shared" for project-level).
  const { data: allVars = [] } = useQuery({
    ...api.variables.project.list(projectId),
    enabled: !!projectId,
  });
  const { data: resources = [] } = useQuery({
    ...api.resources.list(projectId),
    enabled: !!projectId,
  });

  type Group = import("@/components/variable/form").SuggestionGroup;
  const resourceById = new Map(resources.map((r) => [r.id, r] as const));
  const importable = allVars.filter((v) => v.resourceId !== excludeResourceId);
  if (importable.length === 0) return [] as Group[];

  const sharedItems = importable
    .filter((v) => v.resourceId == null)
    .map((v) => ({ id: v.id, key: v.key, secret: v.secret }));

  const ownedByResource = new Map<
    string,
    { name: string; image?: string; items: Group["items"] }
  >();
  for (const v of importable) {
    if (v.resourceId == null) continue;
    const r = resourceById.get(v.resourceId);
    if (!r) continue;
    const entry = ownedByResource.get(v.resourceId) ?? {
      name: r.name,
      image:
        r.config.kind === "app" ? r.config.spec.source.image : undefined,
      items: [],
    };
    entry.items.push({
      id: v.id,
      key: v.key,
      secret: v.secret,
      resourceName: r.name,
    });
    ownedByResource.set(v.resourceId, entry);
  }

  const groups: Group[] = [];
  if (sharedItems.length > 0) {
    groups.push({ label: "Shared", items: sharedItems });
  }
  for (const [, entry] of ownedByResource) {
    groups.push({ label: entry.name, image: entry.image, items: entry.items });
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
    ...api.variables.resource.list(projectId, resourceId),
    enabled: !!resourceId,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const existingKeys = new Set(rawVars.map((v) => v.key));
  const existingSourceIds = new Set(
    rawVars
      .filter((v) => v.kind === "imported")
      .map((v) => v.sourceVariableId),
  );
  const suggestionGroups = useVariableSuggestionGroups(projectId, resourceId)
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (s) => !existingKeys.has(s.key) && !existingSourceIds.has(s.id),
      ),
    }))
    .filter((g) => g.items.length > 0);

  const deleteVar = useMutation(api.variables.resource.remove);

  return (
    <div>
      <Variables
        variables={rawVars.map((v) =>
          v.kind === "owned"
            ? {
                key: v.key,
                value: v.value ?? "",
                secret: v.secret,
                sourceVariableId: undefined,
                sourceKey: undefined,
                sourceResourceName: undefined,
              }
            : {
                key: v.key,
                value: "",
                secret: v.source?.secret ?? false,
                sourceVariableId: v.sourceVariableId,
                sourceKey: v.source?.key,
                sourceResourceName: v.source?.resource?.name,
              },
        )}
        onDelete={(key) => {
          deleteVar.mutate({ projectId, resourceId, key });
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
  initialTab?: string,
  // creatingKind selects which create form renders in "creating" mode (the
  // resource doesn't exist yet, so kind can't come from it).
  creatingKind?: "app" | "postgres" | "redis",
): {
  tabs: DrawerTab[];
  defaultTab: string;
  activeTab?: string;
  setActiveTab: (id: string) => void;
} {
  const qc = useQueryClient();
  const [metricsWindow, setMetricsWindow] = useState(DEFAULT_METRICS_WINDOW_MS);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<
    string | null
  >(null);
  const [activeTab, setActiveTab] = useState(initialTab ?? "overview");
  const openDeployment = useCallback((id: string) => {
    setSelectedDeploymentId(id);
    setActiveTab("deployments");
  }, []);
  const isCreating = !resource;

  if (isCreating) {
    return {
      defaultTab: "settings",
      // Creating has a single tab; let the shell manage it internally.
      activeTab: undefined,
      setActiveTab,
      tabs: [
        {
          id: "settings",
          label: "Settings",
          content:
            creatingKind === "postgres" ? (
              <PostgresSettings
                projectId={projectId}
                createProps={createProps}
              />
            ) : creatingKind === "redis" ? (
              <RedisSettings projectId={projectId} createProps={createProps} />
            ) : (
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

  // staleTime on prefetch makes repeated hovers a no-op when cached.
  // Cast at the call site: queryOptions() returns mutable queryKey;
  // prefetchQuery wants readonly. The runtime data is identical.
  const prefetch = (opts: { queryKey: readonly unknown[] }) =>
    qc.prefetchQuery({
      ...(opts as unknown as Parameters<typeof qc.prefetchQuery>[0]),
      staleTime: 60_000,
    });

  return {
    defaultTab: "overview",
    activeTab,
    setActiveTab,
    tabs: [
      {
        id: "overview",
        label: "Overview",
        onHover: () => {
          prefetch(api.observability.events(projectId, resource.id));
          prefetch(api.observability.logsCapabilities(projectId, resource.id));
          prefetch(api.observability.cpuMetrics(projectId, resource.id));
          prefetch(api.observability.memoryMetrics(projectId, resource.id));
          prefetch(api.observability.requestRateMetrics(projectId, resource.id));
          prefetch(api.observability.errorRateMetrics(projectId, resource.id));
          prefetch(api.observability.latencyMetrics(projectId, resource.id));
        },
        content: (
          <OverviewTab
            resourceId={resource.id}
            projectId={projectId}
            project={project}
            onOpenDeployment={openDeployment}
          />
        ),
      },
      {
        id: "deployments",
        label: "Deployments",
        onHover: () => {
          prefetch(api.deployments.listByResource(projectId, resource.id));
        },
        // Clicking the tab (even when active) exits the detail drill-in.
        onActivate: () => setSelectedDeploymentId(null),
        content: (
          <DeploymentsTab
            resourceId={resource.id}
            projectId={projectId}
            selectedId={selectedDeploymentId}
            onSelectId={setSelectedDeploymentId}
          />
        ),
      },
      {
        id: "metrics",
        label: "Metrics",
        headerRight: (
          <RangeSelector value={metricsWindow} onChange={setMetricsWindow} />
        ),
        onHover: () => {
          // Warm the currently-selected window so the first paint has data.
          const w = metricsWindow;
          prefetch(api.observability.cpuMetrics(projectId, resource.id, w));
          prefetch(api.observability.memoryMetrics(projectId, resource.id, w));
          prefetch(api.observability.diskMetrics(projectId, resource.id, w));
          prefetch(api.observability.networkMetrics(projectId, resource.id, w));
          prefetch(
            api.observability.requestRateMetrics(projectId, resource.id, w),
          );
          prefetch(
            api.observability.errorRateMetrics(projectId, resource.id, w),
          );
          prefetch(api.observability.latencyMetrics(projectId, resource.id, w));
        },
        content: (
          <MetricsTab
            resourceId={resource.id}
            projectId={projectId}
            windowMs={metricsWindow}
            kind={resource.config.kind}
            instances={
              resource.config.kind === "postgres"
                ? resource.config.spec.instances
                : undefined
            }
          />
        ),
      },
      {
        id: "logs",
        label: "Logs",
        onHover: () => {
          prefetch(api.observability.logsCapabilities(projectId, resource.id));
        },
        content: (
          <div className="h-full min-h-0">
            <LogsPanel resourceId={resource.id} projectId={projectId} />
          </div>
        ),
      },
      {
        id: "events",
        label: "Events",
        onHover: () => {
          prefetch(api.observability.events(projectId, resource.id));
        },
        content: (
          <EventsTab resourceId={resource.id} projectId={projectId} />
        ),
      },
      // Backups tab — postgres only (CNPG-backed). Inserted before Settings.
      ...(resource.config.kind === "postgres"
        ? [
            {
              id: "backups",
              label: "Backups",
              onHover: () => {
                prefetch(api.backups.list(projectId, resource.id));
              },
              content: (
                <BackupsTab resourceId={resource.id} projectId={projectId} />
              ),
            },
          ]
        : []),
      {
        id: "settings",
        label: "Settings",
        onHover: () => {
          prefetch(api.routes.list(projectId));
          prefetch(api.variables.project.list(projectId));
          prefetch(api.variables.resource.list(projectId, resource.id));
          prefetch(api.resources.list(projectId));
        },
        content:
          resource.config.kind === "postgres" ? (
            <PostgresSettings resource={resource} projectId={projectId} />
          ) : resource.config.kind === "redis" ? (
            <RedisSettings resource={resource} projectId={projectId} />
          ) : (
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
  initialTab,
  creatingKind,
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
  // initialTab opens the drawer on a specific tab (e.g. the node context
  // menu's "Logs"/"Metrics" shortcuts). Ignored if that tab isn't present
  // for this resource; falls back to the computed default.
  initialTab?: string;
  // creatingKind picks the create form when creating a new resource.
  creatingKind?: "app" | "postgres" | "redis";
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const isOpen = !!resourceId || !!creating;
  const isCreating = !resourceId && !!creating;
  const { data: resource } = useQuery({
    ...api.resources.byId(projectId, resourceId ?? ""),
    enabled: !!resourceId,
  });

  // Managed-service kind (postgres/redis) drives a brand icon + subtitle.
  const kind = resource ? resource.config.kind : creatingKind;
  const managedLabel =
    kind === "postgres" ? "Postgres" : kind === "redis" ? "Redis" : null;
  const managedIcon =
    kind === "postgres" ? (
      <SiPostgresql className="size-5 text-muted-foreground" />
    ) : kind === "redis" ? (
      <SiRedis className="size-5 text-muted-foreground" />
    ) : null;

  const drawerName = isCreating
    ? managedLabel
      ? `New ${managedLabel}`
      : "New service"
    : (resource?.name ?? "New service");
  const { tabs, defaultTab, activeTab, setActiveTab } = useServiceDrawerTabs(
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
    initialTab && ["overview", "deployments", "metrics", "logs", "events", "settings"].includes(initialTab)
      ? initialTab
      : undefined,
    creatingKind,
  );

  if (!isOpen) return null;

  const image = resource ? getAppSpec(resource)?.source.image : undefined;

  return (
    <ServiceDrawerShell
      name={
        managedLabel && resource ? (
          <div className="min-w-0">
            <p className="text-lg font-semibold truncate leading-tight">
              {resource.name}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {managedLabel}
            </p>
          </div>
        ) : (
          drawerName
        )
      }
      icon={
        managedIcon ?? (resource ? <ServiceIcon image={image} /> : undefined)
      }
      tabs={tabs}
      defaultTab={
        initialTab && tabs.some((t) => t.id === initialTab)
          ? initialTab
          : defaultTab
      }
      activeTab={activeTab}
      onTabChange={setActiveTab}
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
