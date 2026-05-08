import type { ServiceAppCreate } from "@vyft/spec";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { type Control, useFieldArray } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMb } from "@/lib/units";

export function DisksFormSection({
  control,
  onAdd,
  addDialog,
}: {
  control: Control<ServiceAppCreate>;
  onAdd: () => void;
  addDialog?: React.ReactNode;
}) {
  const { fields, remove } = useFieldArray({
    control,
    name: "service.spec.disks",
  });

  return (
    <div className="space-y-3">
      {fields.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Path</TableHead>
              <TableHead className="w-16">Size</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
              <TableRow
                key={field.id}
                className="group"
                data-testid="service.form.disks.row"
                data-name={field.name}
              >
                <TableCell className="font-mono text-xs">
                  {field.name}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {field.path}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatMb(field.size)}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    data-testid="service.form.disks.row.delete"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(index)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        data-testid="service.form.disks.add"
        onClick={onAdd}
      >
        <PlusIcon />
        Add disk
      </Button>

      {addDialog}
    </div>
  );
}
