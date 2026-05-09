import { useQuery } from "@tanstack/react-query";
import { FolderIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { ProjectCard } from "@/components/project/card";
import { CreateProjectDialog } from "@/components/project/create";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/lib/api";

export default function Projects() {
  const { data: projectList, isLoading } = useQuery(api.projects.list());
  const [dialogOpen, setDialogOpen] = useState(false);

  const hasItems = !!projectList && projectList.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        {(isLoading || hasItems) && (
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            disabled={isLoading}
            data-testid="project-create-button"
          >
            <PlusIcon />
            New project
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] w-full rounded-xl" />
          ))}
        </div>
      ) : hasItems ? (
        <div className="grid grid-cols-2 gap-4">
          {projectList.map((project) => (
            <ProjectCard
              key={project.id}
              name={project.name}
              services={[]}
              href={`/projects/${project.slug}`}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <FolderIcon className="size-5 text-muted-foreground" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">No projects yet</p>
            <p className="text-xs text-muted-foreground">
              Get started by creating your first project.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            data-testid="project-create-button"
          >
            <PlusIcon />
            Create project
          </Button>
        </div>
      )}

      <CreateProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
