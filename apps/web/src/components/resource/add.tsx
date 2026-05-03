import { ContainerIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { componentDefinitions } from "@/lib/component-definitions";

export interface ServiceSource {
  type: "image";
}

export function AddResourceDialog({
  open,
  onOpenChange,
  onSelect,
  dismissible = true,
  container,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect: (type: string, source?: ServiceSource) => void;
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
        <Command className="rounded-none border-0 flex flex-col flex-1 min-h-0">
          <CommandInput placeholder="Search resources..." />
          <CommandList className="h-80 max-h-none pt-1">
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Sources">
              <CommandItem
                onSelect={() => onSelect("service", { type: "image" })}
                data-testid="service-source-image-option"
              >
                <ContainerIcon className="text-muted-foreground" />
                Container Image
              </CommandItem>
            </CommandGroup>
            {[...new Set(componentDefinitions.map((d) => d.category))].map(
              (category) => (
                <CommandGroup key={category} heading={category}>
                  {componentDefinitions
                    .filter((d) => d.category === category)
                    .map((def) => {
                      const Icon = def.icon;
                      return (
                        <CommandItem
                          key={def.type}
                          disabled
                          className="opacity-50"
                        >
                          <Icon className="text-muted-foreground" />
                          <span className="flex-1">{def.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            Coming soon
                          </span>
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              ),
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
