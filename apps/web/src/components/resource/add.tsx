import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ResourcePickerCommand, type ResourceSelectHandler } from "./picker";

export type { ServiceSource } from "./picker";

export function AddResourceDialog({
  open,
  onOpenChange,
  onSelect,
  dismissible = true,
  container,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect: ResourceSelectHandler;
  dismissible?: boolean;
  container?: HTMLElement | null;
}) {
  const handleOpenChange = (v: boolean) => {
    if (dismissible) onOpenChange?.(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} modal={!container}>
      <DialogContent
        className="sm:max-w-lg flex flex-col p-0 gap-0 overflow-hidden"
        showCloseButton={dismissible}
        container={container}
      >
        <ResourcePickerCommand onSelect={onSelect} />
      </DialogContent>
    </Dialog>
  );
}
