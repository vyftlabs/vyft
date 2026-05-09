import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type SuggestionGroup,
  VariableForm,
  type VariableFormValues,
} from "@/components/variable/form";
import * as api from "@/lib/api";

export function AddVariableDialog({
  projectId,
  resourceId,
  suggestionGroups = [],
  open,
  onOpenChange,
  onAddLocal,
}: {
  project?: string;
  projectId?: string;
  resourceId?: string;
  suggestionGroups?: SuggestionGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddLocal?: (v: {
    key: string;
    value: string;
    secret?: boolean;
    sourceVariableId?: string;
  }) => void;
}) {
  const isResourceScope = !!resourceId;

  const createShared = useMutation(api.variables.project.create);
  const createOwned = useMutation(api.variables.resource.create);
  const createVar = isResourceScope ? createOwned : createShared;

  const handleSubmit = (
    data: VariableFormValues & { sourceVariableId?: string },
  ) => {
    if (onAddLocal) {
      onAddLocal({
        key: data.key,
        value: data.value,
        secret: data.secret,
        sourceVariableId: data.sourceVariableId,
      });
      onOpenChange(false);
      return;
    }
    if (!projectId) return;

    if (isResourceScope) {
      const body = data.sourceVariableId
        ? {
            kind: "imported" as const,
            key: data.key,
            sourceVariableId: data.sourceVariableId,
          }
        : {
            kind: "owned" as const,
            key: data.key,
            value: data.value,
            secret: data.secret,
          };
      createOwned.mutate(
        { projectId, resourceId: resourceId!, body },
        {
          onSuccess: () => onOpenChange(false),
          onError: (err: Error) => toast.error(err.message),
        },
      );
    } else {
      createShared.mutate(
        {
          projectId,
          body: {
            key: data.key,
            value: data.value,
            secret: data.secret,
          },
        },
        {
          onSuccess: () => onOpenChange(false),
          onError: (err: Error) => toast.error(err.message),
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add variable</DialogTitle>
          <DialogDescription>
            {isResourceScope
              ? "Add an environment variable. Pick from existing to reference another service."
              : "Add a shared environment variable."}
          </DialogDescription>
        </DialogHeader>
        <VariableForm
          suggestionGroups={isResourceScope ? suggestionGroups : []}
          isPending={createVar.isPending}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
