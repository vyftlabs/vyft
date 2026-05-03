import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, FolderIcon, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { CreateProjectDialog } from "@/components/projects/create-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import * as api from "@/lib/api";

export function ProjectSwitcher() {
  const navigate = useNavigate();
  const { project: projectSlug } = useParams();
  const { data: projectList = [], isSuccess } = useQuery(api.projects.list());
  const [dialogOpen, setDialogOpen] = useState(false);

  const activeProject = projectList.find((p) => p.slug === projectSlug);

  if (!isSuccess) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" className="gap-2 text-sm" />
          }
        >
          <FolderIcon className="size-4" />
          <span>{activeProject?.name ?? ""}</span>
          <ChevronsUpDown className="size-3 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="min-w-56 rounded-lg"
          align="start"
          sideOffset={4}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Projects
            </DropdownMenuLabel>
            {projectList.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => {
                  navigate(`/projects/${project.slug}`);
                }}
                className="gap-2 p-2"
              >
                <div className="flex size-6 items-center justify-center rounded-md border">
                  <FolderIcon className="size-3.5 shrink-0" />
                </div>
                {project.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 p-2"
            onClick={() => setDialogOpen(true)}
          >
            <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
              <Plus className="size-4" />
            </div>
            <div className="font-medium text-muted-foreground">
              Create project
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
