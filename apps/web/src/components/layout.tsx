import * as React from "react";
import { Link, Outlet, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RocketIcon } from "lucide-react";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ProjectSwitcher } from "@/components/project-switcher";
import * as api from "@/lib/api";

function DeployButton({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const { data: current } = useQuery({
    ...api.deployments.checksum(projectId),
    staleTime: 0,
  });
  const { data: latest } = useQuery({
    ...api.deployments.latest(projectId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "pending" || status === "applying") return 1000;
      return false;
    },
  });

  const isDeploying = latest?.status === "pending" || latest?.status === "applying";
  const hasChanges = current?.checksum && (!latest || latest.checksum !== current.checksum);
  const wasDeploying = React.useRef(false);

  const deploy = useMutation(api.deployments.create);

  React.useEffect(() => {
    if (isDeploying) {
      wasDeploying.current = true;
    } else if (wasDeploying.current && latest) {
      wasDeploying.current = false;
      if (latest.status === "applied") {
        queryClient.invalidateQueries({ queryKey: api.deployments.checksum(projectId).queryKey });
      } else if (latest.status === "failed") {
        toast.error("Deployment failed");
      }
    }
  }, [latest?.status, queryClient, projectId]);

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
    ...api.projects.bySlug(project!),
    enabled: !!project,
  });

  return (
    <header className="flex h-14 shrink-0 items-center">
      <Link
        to="/"
        className="flex items-center shrink-0 overflow-hidden pl-3 pr-2 md:pl-0 md:pr-0 md:transition-[width] md:duration-200 md:ease-linear"
        style={isMobile ? undefined : { width: open ? "var(--sidebar-width)" : "var(--sidebar-width-icon)" }}
      >
        <div className="flex items-center justify-center shrink-0 md:w-(--sidebar-width-icon) w-auto">
          <div className="h-5 bg-foreground shrink-0" style={{ aspectRatio: "560/676", maskImage: "url(/logo.svg)", maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center", WebkitMaskImage: "url(/logo.svg)", WebkitMaskSize: "contain", WebkitMaskRepeat: "no-repeat", WebkitMaskPosition: "center" }} />
        </div>
        <span className="ml-2 md:-ml-2 text-sm font-semibold tracking-tight whitespace-nowrap md:transition-opacity md:duration-200" style={isMobile ? undefined : { opacity: open ? 1 : 0 }}>Vyft</span>
      </Link>
      <div className="flex flex-1 items-center gap-1">
        {project && (
          <ProjectSwitcher />
        )}
        {projectData?.id && (
          <div className="ml-auto pr-3">
            <DeployButton projectId={projectData.id} />
          </div>
        )}
      </div>
    </header>
  );
}

export default function Layout() {
  const { project } = useParams();
  const inProject = !!project;

  const [open, setOpen] = React.useState(() => {
    if (!inProject) return true;
    const saved = localStorage.getItem("vyft-sidebar-open");
    return saved !== null ? saved === "true" : false;
  });

  const handleOpenChange = React.useCallback((value: boolean) => {
    setOpen(value);
    if (inProject) localStorage.setItem("vyft-sidebar-open", String(value));
  }, [inProject]);

  React.useEffect(() => {
    if (!inProject) {
      setOpen(true);
    } else {
      const saved = localStorage.getItem("vyft-sidebar-open");
      setOpen(saved === "true");
    }
  }, [inProject]);

  return (
    <TooltipProvider>
      <SidebarProvider open={open} onOpenChange={handleOpenChange} className="h-svh !min-h-0 flex-col">
        <LayoutHeader />
        <div className="flex flex-1 min-h-0">
          <AppSidebar />
          <SidebarInset className="overflow-hidden">
            <div className="flex-1 min-h-0">
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
