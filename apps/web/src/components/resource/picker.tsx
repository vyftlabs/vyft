import { ContainerIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { componentDefinitions } from "@/lib/component-definitions";

export interface ServiceSource {
  type: "image";
}

export type ResourceSelectHandler = (
  type: string,
  source?: ServiceSource,
) => void;

export function ResourcePickerCommand({
  onSelect,
  className,
  listClassName,
}: {
  onSelect: ResourceSelectHandler;
  className?: string;
  listClassName?: string;
}) {
  return (
    <Command
      className={
        className ?? "rounded-none border-0 flex flex-col flex-1 min-h-0"
      }
    >
      <CommandInput autoFocus placeholder="Search resources..." />
      <CommandList className={listClassName ?? "h-80 max-h-none pt-1"}>
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
  );
}

export function ResourcePickerPopover({
  x,
  y,
  onSelect,
  onClose,
}: {
  x: number;
  y: number;
  onSelect: ResourceSelectHandler;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 320);
  const top = Math.min(y, window.innerHeight - 360);

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-50 w-80 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
    >
      <ResourcePickerCommand
        className="rounded-md border-0 flex flex-col"
        listClassName="h-72 max-h-none pt-1"
        onSelect={onSelect}
      />
    </div>
  );
}
