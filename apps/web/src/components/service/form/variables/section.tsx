import { useQuery } from "@tanstack/react-query";
import type { ServiceAppCreate } from "@vyft/spec";
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
  control: Control<ServiceAppCreate>;
  projectId: string;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "variables",
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data } = useQuery({
    ...api.variables.suggestions(projectId),
    enabled: !!projectId,
  });

  const groups: SuggestionGroup[] = [];

  if (data?.shared?.length) {
    groups.push({ label: "Shared", items: data.shared });
  }

  // Merge built-ins and user-defined service vars under each owning service.
  type Item = SuggestionGroup["items"][number];
  const byService = new Map<string, { items: Item[]; image?: string }>();
  const ensure = (name: string, image?: string) => {
    let entry = byService.get(name);
    if (!entry) {
      entry = { items: [], image };
      byService.set(name, entry);
    } else if (!entry.image && image) {
      entry.image = image;
    }
    return entry;
  };
  for (const b of data?.builtin ?? []) {
    ensure(b.resourceName ?? "Unknown", b.resourceImage).items.push(b);
  }
  for (const v of data?.service ?? []) {
    ensure(v.resourceName ?? "Unknown", v.resourceImage).items.push(v);
  }
  for (const [name, { items, image }] of byService) {
    groups.push({ label: name, image, items });
  }

  return (
    <Variables
      variables={fields.map((f) => ({
        key: f.key,
        value: f.value,
        secret: f.secret,
      }))}
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
          append({
            key: v.key,
            value: v.value,
            secret: v.secret ?? false,
            sourceVariableId: v.sourceVariableId,
          })
        }
      />
    </Variables>
  );
}
