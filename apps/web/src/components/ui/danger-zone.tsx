import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export interface DangerZoneProps {
  title: string;
  description: string;
  action: string;
  onAction: () => void | Promise<void>;
  disabled?: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
  confirmInput?: string;
}

export function DangerZone({
  title,
  description,
  action,
  onAction,
  disabled,
  confirmTitle,
  confirmDescription,
  confirmInput,
}: DangerZoneProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const isBlocked = disabled || pending;
  const isConfirmDisabled =
    isBlocked || (confirmInput ? inputValue !== confirmInput : false);

  const handleAction = async () => {
    setPending(true);
    try {
      await onAction();
      setOpen(false);
    } catch {
      // keep dialog open — parent handles error display (e.g. toast)
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
        <div>
          <h3 className="text-sm font-medium text-destructive">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="shrink-0"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          {action}
        </Button>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(v) => {
          if (!pending) setOpen(v);
          if (!v) setInputValue("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTitle ?? "Are you sure?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDescription ?? description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmInput && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Type{" "}
                <span className="font-mono font-medium text-foreground">
                  {confirmInput}
                </span>{" "}
                to confirm.
              </p>
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={confirmInput}
                disabled={pending}
                autoComplete="off"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isConfirmDisabled}
              onClick={(e) => {
                e.preventDefault();
                handleAction();
              }}
            >
              {pending && <Spinner className="size-4" />}
              {action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
