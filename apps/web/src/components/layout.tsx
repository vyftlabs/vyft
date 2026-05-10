import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RocketIcon } from "lucide-react";
import * as React from "react";
import { Link, Outlet, useParams } from "react-router";
import { toast } from "sonner";
import { ProjectSwitcher } from "@/components/project/switcher";
import { AppSidebar } from "@/components/sidebar/app";
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { TooltipProvider } from "@/components/ui/tooltip";
import * as api from "@/lib/api";
import {
  buildSnapshot,
  canonicalStringify,
  snapshotHash,
} from "@/lib/deploy/snapshot";

function DeployButton({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  // Latest deployment = first item of the list (ordered created DESC by API).
  // Poll while pending/applying so the spinner clears as soon as the row settles.
  const { data: deployments } = useQuery({
    ...api.deployments.list(projectId),
    refetchInterval: (query) => {
      const status = query.state.data?.[0]?.status;
      if (status === "pending" || status === "applying") return 1000;
      return false;
    },
  });
  const latest = deployments?.[0];

  // Build the current-view snapshot from cached query data and compare its
  // hash to the snapshot stored on the latest deployment row. Mismatch =
  // changes pending → show button.
  const { data: resources = [] } = useQuery(api.resources.list(projectId));
  const { data: routes = [] } = useQuery(api.routes.list(projectId));
  const { data: variables = [] } = useQuery(
    api.variables.project.list(projectId),
  );

  // Default hidden. The async compare flips it on if hashes differ.
  const [hasChanges, setHasChanges] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = buildSnapshot({ resources, routes, variables });
      const currentHash = await snapshotHash(current);
      const deployedHash = latest?.snapshot
        ? await snapshotHash(latest.snapshot)
        : null;
      if (cancelled) return;
      setHasChanges(deployedHash == null || deployedHash !== currentHash);
      if (
        import.meta.env.DEV &&
        deployedHash != null &&
        deployedHash !== currentHash
      ) {
        // Diagnostic for hash mismatches. Drop once gating is stable.
        console.debug("[deploy] hash mismatch", {
          currentHash,
          deployedHash,
          current: canonicalStringify(current),
          deployed: canonicalStringify(latest?.snapshot),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resources, routes, variables, latest?.snapshot]);

  const isDeploying =
    latest?.status === "pending" || latest?.status === "applying";
  const wasDeploying = React.useRef(false);

  const deploy = useMutation(api.deployments.create);

  React.useEffect(() => {
    if (isDeploying) {
      wasDeploying.current = true;
    } else if (wasDeploying.current && latest) {
      wasDeploying.current = false;
      if (latest.status === "failed") {
        toast.error(latest.error ?? "Deployment failed");
      }
      queryClient.invalidateQueries({
        queryKey: api.deployments.list(projectId).queryKey,
      });
    }
  }, [latest?.status, latest, queryClient, projectId, isDeploying]);

  if (!hasChanges && !isDeploying) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => deploy.mutate({ projectId })}
      disabled={deploy.isPending || isDeploying}
      data-testid="deploy-button"
    >
      {deploy.isPending || isDeploying ? (
        <Spinner className="size-3.5" />
      ) : (
        <RocketIcon className="size-3.5" />
      )}
      {isDeploying ? "Deploying" : "Deploy"}
    </Button>
  );
}

function LayoutHeader() {
  const { project } = useParams();
  const { open, isMobile } = useSidebar();

  const { data: projectData } = useQuery({
    ...api.projects.bySlug(project ?? ""),
    enabled: !!project,
  });

  return (
    <header className="flex h-14 shrink-0 items-center">
      <Link
        to="/"
        className="flex items-center shrink-0 overflow-hidden pl-3 pr-2 md:pl-0 md:pr-0 md:transition-[width] md:duration-200 md:ease-linear"
        style={
          isMobile
            ? undefined
            : {
                width: open
                  ? "var(--sidebar-width)"
                  : "var(--sidebar-width-icon)",
              }
        }
      >
        <div className="flex items-center justify-center shrink-0 md:w-(--sidebar-width-icon) w-auto">
          <div
            className="h-5 bg-foreground shrink-0"
            style={{
              aspectRatio: "560/676",
              maskImage: "url(/logo.svg)",
              maskSize: "contain",
              maskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskImage: "url(/logo.svg)",
              WebkitMaskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
            }}
          />
        </div>
        <span
          className="ml-2 md:-ml-2 text-sm font-semibold tracking-tight whitespace-nowrap md:transition-opacity md:duration-200"
          style={isMobile ? undefined : { opacity: open ? 1 : 0 }}
        >
          Vyft
        </span>
      </Link>
      <div className="flex flex-1 items-center gap-1">
        {project && <ProjectSwitcher />}
        {projectData?.id && (
          <div className="ml-auto pr-3">
            <DeployButton projectId={projectData.id} />
          </div>
        )}
      </div>
    </header>
  );
}

function readProjectSidebarOpen() {
  const saved = localStorage.getItem("vyft-sidebar-open");
  return saved !== null ? saved === "true" : false;
}

function LayoutSidebarProvider({
  children,
  inProject,
}: {
  children: React.ReactNode;
  inProject: boolean;
}) {
  const [open, setOpen] = React.useState(() =>
    inProject ? readProjectSidebarOpen() : true,
  );

  const prevInProject = React.useRef(inProject);
  React.useEffect(() => {
    if (prevInProject.current === inProject) return;
    prevInProject.current = inProject;
    setOpen(inProject ? readProjectSidebarOpen() : true);
  }, [inProject]);

  const handleOpenChange = React.useCallback(
    (value: boolean) => {
      setOpen(value);
      if (inProject) localStorage.setItem("vyft-sidebar-open", String(value));
    },
    [inProject],
  );

  return (
    <SidebarProvider
      open={open}
      onOpenChange={handleOpenChange}
      className="h-svh !min-h-0 flex-col"
    >
      {children}
    </SidebarProvider>
  );
}

export default function Layout() {
  const { project } = useParams();
  const inProject = !!project;

  return (
    <TooltipProvider>
      <LayoutSidebarProvider inProject={inProject}>
        <LayoutHeader />
        <div className="flex flex-1 min-h-0">
          <AppSidebar />
          <SidebarInset className="overflow-hidden">
            <div className="flex-1 min-h-0">
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </LayoutSidebarProvider>
    </TooltipProvider>
  );
}
