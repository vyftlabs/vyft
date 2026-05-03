import { type Control, useFieldArray } from "react-hook-form"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ServiceFormValues } from "./types"

export function VolumesFormSection({
  control,
  onAdd,
  addDialog,
}: {
  control: Control<ServiceFormValues>
  onAdd: () => void
  addDialog?: React.ReactNode
}) {
  const { fields, remove } = useFieldArray({ control, name: "volumes" })

  return (
    <div className="space-y-3">
      {fields.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mount path</TableHead>
              <TableHead className="w-16">Size</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
              <TableRow key={field.id} className="group">
                <TableCell className="font-mono text-xs">{field.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{field.mountPath}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{field.size}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
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

      <Button type="button" variant="outline" size="sm" className="w-full" onClick={onAdd}>
        <PlusIcon />
        Add volume
      </Button>

      {addDialog}
    </div>
  )
}
