import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { AddVariableDialog } from "@/components/add-variable-dialog";
import { Variables } from "@/components/services/form/variables";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";

export default function SharedVariables() {
  const { project: slug } = useParams();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: projectData } = useQuery({
    ...api.projects.bySlug(slug ?? ""),
    enabled: !!slug,
  });

  const projectId = projectData?.id;

  const { data: variables = [], refetch } = useQuery({
    ...api.variables.list(projectId ?? ""),
    enabled: !!projectId,
  });

  const createVariable = useMutation(api.variables.create);

  const deleteVariable = useMutation(api.variables.remove);

  const mapped = variables.map((v) => ({
    key: v.key,
    value: v.value ?? "",
    secret: v.sensitive,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Variables</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Environment variables available to all services.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
          disabled={!projectId}
        >
          <PlusIcon />
          Add variable
        </Button>
      </div>

      <Variables
        variables={mapped}
        onDelete={(key) => {
          const v = variables.find((v) => v.key === key);
          if (v && projectId) {
            deleteVariable.mutate(
              { projectId, id: v.id },
              {
                onSuccess: () => refetch(),
                onError: (err: Error) => toast.error(err.message),
              },
            );
          }
        }}
      >
        <Variables.List />
      </Variables>
      <AddVariableDialog
        project={slug ?? ""}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAddLocal={(data) => {
          if (!projectId) return;
          createVariable.mutate(
            {
              projectId,
              body: {
                key: data.key,
                value: data.value,
                sensitive: data.secret ?? false,
              },
            },
            {
              onSuccess: () => {
                refetch();
                setDialogOpen(false);
              },
              onError: (err: Error) => toast.error(err.message),
            },
          );
        }}
      />
    </div>
  );
}
