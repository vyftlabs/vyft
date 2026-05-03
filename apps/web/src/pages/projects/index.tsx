import { useState } from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { PlusIcon, FolderIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProjectCard } from "@/components/projects/card"
import { CreateProjectDialog } from "@/components/projects/create-dialog"
import * as api from "@/lib/api"

export default function Projects() {
  const { data: projectList, isLoading } = useQuery(api.projects.list())
  const [dialogOpen, setDialogOpen] = useState(false)

  if (isLoading) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        {projectList && projectList.length > 0 && (
          <Button size="sm" onClick={() => setDialogOpen(true)} data-testid="project-create-button">
            <PlusIcon />
            New project
          </Button>
        )}
      </div>

      {projectList && projectList.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {projectList.map((project) => (
            <Link key={project.id} to={`/projects/${project.slug}`}>
              <ProjectCard name={project.name} services={[]} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <FolderIcon className="size-5 text-muted-foreground" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">No projects yet</p>
            <p className="text-xs text-muted-foreground">Get started by creating your first project.</p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)} data-testid="project-create-button">
            <PlusIcon />
            Create project
          </Button>
        </div>
      )}

      <CreateProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
