import type * as React from "react";
import { cn } from "@/lib/utils";

function List({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list"
      className={cn("divide-y divide-border", className)}
      {...props}
    />
  );
}

function ListItem({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-item"
      className={cn(
        "group/list-item flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/50",
        className,
      )}
      {...props}
    />
  );
}

function ListIcon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-icon"
      className={cn("shrink-0 text-muted-foreground [&_svg]:size-4", className)}
      {...props}
    />
  );
}

function ListContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-content"
      className={cn("flex flex-1 flex-col gap-0.5 min-w-0", className)}
      {...props}
    />
  );
}

function ListTitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="list-title"
      className={cn("text-sm font-medium truncate", className)}
      {...props}
    />
  );
}

function ListDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="list-description"
      className={cn("text-xs text-muted-foreground truncate", className)}
      {...props}
    />
  );
}

function ListAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-action"
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}

function ListEmpty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-empty"
      className={cn(
        "py-16 text-center text-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  List,
  ListItem,
  ListIcon,
  ListContent,
  ListTitle,
  ListDescription,
  ListAction,
  ListEmpty,
};
