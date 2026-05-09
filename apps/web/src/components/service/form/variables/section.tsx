import { useQuery } from "@tanstack/react-query";
import type { ResourceAppCreate } from "@vyft/spec";
import { useState } from "react";
import { type Control, useFieldArray } from "react-hook-form";
import { AddVariableDialog } from "@/components/variable/add";
import type { SuggestionGroup } from "@/components/variable/form";
import * as api from "@/lib/api";
import { Variables } from ".";

export function VariablesSection({
  control,
  projectId,
}: {
  control: Control<ResourceAppCreate>;
  projectId: string;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "variables",
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  // Suggestions = every project variable (shared + owned by other resources).
  // Resource-being-created has no id yet so nothing to exclude.
  const { data: allVars = [] } = useQuery({
    ...api.variables.project.list(projectId),
    enabled: !!projectId,
  });
  const { data: resources = [] } = useQuery({
    ...api.resources.list(projectId),
    enabled: !!projectId,
  });

  const resourceById = new Map(resources.map((r) => [r.id, r] as const));
  const sharedItems = allVars
    .filter((v) => v.resourceId == null)
    .map((v) => ({ id: v.id, key: v.key, secret: v.secret }));
  const ownedByResource = new Map<
    string,
    { name: string; image?: string; items: SuggestionGroup["items"] }
  >();
  for (const v of allVars) {
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

  const groups: SuggestionGroup[] = [];
  if (sharedItems.length) groups.push({ label: "Shared", items: sharedItems });
  for (const [, entry] of ownedByResource) {
    groups.push({ label: entry.name, image: entry.image, items: entry.items });
  }

  return (
    <Variables
      variables={fields.map((f) =>
        f.kind === "owned"
          ? { key: f.key, value: f.value ?? "", secret: f.secret ?? false }
          : { key: f.key, value: "", secret: false },
      )}
      onDelete={(key) => {
        const index = fields.findIndex((f) => f.key === key);
        if (index !== -1) remove(index);
      }}
    >
      <Variables.List />
      <Variables.AddButton onClick={() => setDialogOpen(true)} />
      <AddVariableDialog
        project=""
        suggestionGroups={groups}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAddLocal={(v) =>
          append(
            v.sourceVariableId
              ? {
                  kind: "imported",
                  key: v.key,
                  sourceVariableId: v.sourceVariableId,
                }
              : {
                  kind: "owned",
                  key: v.key,
                  value: v.value,
                  secret: v.secret ?? false,
                },
          )
        }
      />
    </Variables>
  );
}
