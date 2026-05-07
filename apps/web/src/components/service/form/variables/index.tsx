import { LinkIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

export interface VariableEntry {
  key: string;
  value: string;
  secret?: boolean;
  sourceVariableId?: string;
  sourceKey?: string;
  sourceResourceName?: string;
}

interface VariablesContext {
  variables: VariableEntry[];
  onDelete: (key: string) => void;
}

const Ctx = createContext<VariablesContext | null>(null);

function useVariables() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Variables.* must be used within <Variables>");
  return ctx;
}

function Root({
  variables,
  onDelete,
  children,
}: {
  variables: VariableEntry[];
  onDelete: (key: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Ctx value={{ variables, onDelete }}>
      <div className="space-y-3">{children}</div>
    </Ctx>
  );
}

function List() {
  const { variables, onDelete } = useVariables();
  if (variables.length === 0) return null;

  return (
    <Table>
      <TableBody>
        {variables.map((v) => {
          const isReference = !!v.sourceVariableId;
          const isSecret =
            !isReference && (v.secret || v.value.startsWith("secret://"));
          return (
            <TableRow
              key={v.key}
              className="group"
              data-testid="service.form.variables.row"
              data-key={v.key}
            >
              <TableCell className="font-mono text-xs w-1/2">{v.key}</TableCell>
              <TableCell className="text-xs w-1/2">
                {isReference ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <LinkIcon className="size-3 shrink-0" />
                    {v.sourceResourceName && (
                      <span>{v.sourceResourceName}</span>
                    )}
                    {v.sourceResourceName && (
                      <span className="text-muted-foreground/50">/</span>
                    )}
                    <span className="font-mono">{v.sourceKey ?? v.key}</span>
                  </span>
                ) : isSecret ? (
                  <span className="text-muted-foreground">••••••••</span>
                ) : (
                  <span className="font-mono">{v.value}</span>
                )}
              </TableCell>
              <TableCell className="text-right w-10">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  data-testid="service.form.variables.row.delete"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive ml-auto"
                  onClick={() => onDelete(v.key)}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full"
      data-testid="service.form.variables.add"
      onClick={onClick}
    >
      <PlusIcon />
      Add variable
    </Button>
  );
}

export const Variables = Object.assign(Root, { List, AddButton });
