import { toast } from "sonner"
import { useMutation } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { VariableForm, type VariableSuggestion, type SuggestionGroup } from "@/components/variable-form"
import * as api from "@/lib/api"

export function AddVariableDialog({
  project: _project,
  projectId,
  resourceId,
  suggestions = [],
  suggestionGroups,
  open,
  onOpenChange,
  onAddLocal,
}: {
  project: string
  projectId?: string
  resourceId?: string
  suggestions?: VariableSuggestion[]
  suggestionGroups?: SuggestionGroup[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddLocal?: (v: { key: string; value: string; secret?: boolean; sourceVariableId?: string }) => void
}) {
  const isResourceScope = !!resourceId

  const allSuggestions = suggestionGroups
    ? suggestionGroups.flatMap((g) => g.items)
    : suggestions

  const createVar = useMutation(api.variables.create)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add variable</DialogTitle>
          <DialogDescription>
            {isResourceScope
              ? "Add an environment variable to this service."
              : "Add a shared environment variable."}
          </DialogDescription>
        </DialogHeader>
        <VariableForm
          suggestions={suggestions}
          suggestionGroups={suggestionGroups}
          isPending={createVar.isPending}
          onSubmit={(data) => {
            const linked = data.linkedKey ? allSuggestions.find((s) => s.key === data.linkedKey) : undefined

            if (onAddLocal) {
              onAddLocal({ key: data.key, value: linked ? "" : data.value, secret: data.secret, sourceVariableId: linked?.id })
              onOpenChange(false)
              return
            }
            if (projectId) {
              createVar.mutate(
                {
                  projectId,
                  body: {
                    key: data.key,
                    value: linked ? undefined : data.value,
                    sensitive: linked ? false : (data.secret ?? false),
                    resourceId,
                    sourceVariableId: linked?.id,
                  },
                },
                { onSuccess: () => onOpenChange(false), onError: (err: Error) => toast.error(err.message) },
              )
            }
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
