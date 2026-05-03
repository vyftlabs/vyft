import { Outlet } from "react-router";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export default function PageContainer({ wide }: { wide?: boolean }) {
  if (wide) {
    return (
      <div className="h-full">
        <Outlet />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className={cn("px-8 pt-12 pb-8 mx-auto max-w-5xl")}>
        <div className="p-6">
          <Outlet />
        </div>
      </div>
    </ScrollArea>
  );
}
