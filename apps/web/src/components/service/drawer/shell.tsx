import { XIcon } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { EventTimeline, type TimelineEntry } from "./timeline";

export interface DrawerTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

export interface ServiceDrawerShellProps {
  name: React.ReactNode;
  icon?: React.ReactNode;
  tabs: DrawerTab[];
  defaultTab?: string;
  banner?: React.ReactNode;
  footer?: React.ReactNode;
  skipEntryAnimation?: boolean;
  expanded?: boolean;
  expandedContent?: React.ReactNode;
  onClose: () => void;
}

// --- Overview building blocks ---

export interface Threshold {
  warning: number;
  critical: number;
}

export interface SparklineData {
  title: string;
  data: Record<string, unknown>[];
  dataKey: string;
  unit: string;
  threshold?: Threshold;
}

export interface LatencyChartData {
  data: Record<string, unknown>[];
  keys: { dataKey: string; label: string; threshold?: Threshold }[];
  unit?: string;
}

export type DetailView = "events" | "logs" | "metrics" | null;

export interface OverviewProps {
  metricsArea?: React.ReactNode;
  timeline?: TimelineEntry[];
  logsArea?: React.ReactNode;
}

export function Overview({
  metricsArea,
  timeline = [],
  logsArea,
}: OverviewProps) {
  const showTimeline = timeline !== undefined;
  const showLogs = logsArea !== undefined;
  return (
    <div className="flex flex-col gap-5 h-full">
      {metricsArea && (
        <div className="space-y-2 shrink-0">
          <p className="text-xs font-medium">Metrics</p>
          {metricsArea}
        </div>
      )}

      {(showTimeline || showLogs) && (
        <div
          className={cn(
            "flex-1 min-h-0 grid gap-4",
            showTimeline && showLogs ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {showTimeline && (
            <div className="min-h-0 flex flex-col">
              <div className="mb-2 shrink-0">
                <p className="text-xs font-medium">Events</p>
              </div>
              <div className="flex-1 min-h-0 relative">
                {timeline.length > 0 ? (
                  <ScrollArea className="h-full -mr-4">
                    <div className="pr-4">
                      <EventTimeline entries={timeline} />
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                    No events yet
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-background to-transparent pointer-events-none" />
              </div>
            </div>
          )}
          {showLogs && logsArea}
        </div>
      )}
    </div>
  );
}


// --- Drawer shell ---

const drawerTransition = {
  type: "spring" as const,
  stiffness: 400,
  damping: 32,
  mass: 0.8,
};

export function ServiceDrawerShell({
  name,
  icon,
  tabs,
  defaultTab,
  banner,
  footer,
  skipEntryAnimation,
  expanded,
  expandedContent,
  onClose,
}: ServiceDrawerShellProps) {
  const initialTab = defaultTab ?? tabs[0]?.id;

  return (
    <>
      <motion.div
        className="absolute inset-0 z-40 bg-black/5"
        initial={skipEntryAnimation ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={expanded ? undefined : onClose}
      />

      <motion.div
        data-testid="service.drawer"
        className="absolute z-50 flex flex-col bg-background shadow-lg overflow-hidden"
        initial={
          skipEntryAnimation
            ? false
            : {
                opacity: 0,
                scale: 0.96,
                x: 16,
                y: 16,
                bottom: 0,
                right: 0,
                width: "100%",
                maxWidth: "min(72rem, calc(100vw - 2rem))",
                height: "80%",
                borderTopLeftRadius: 8,
                borderWidth: 1,
              }
        }
        animate={
          expanded
            ? {
                opacity: 1,
                scale: 1,
                x: 0,
                y: 0,
                bottom: 0,
                right: 0,
                left: 0,
                top: 0,
                width: "100%",
                maxWidth: "100%",
                height: "100%",
                borderTopLeftRadius: 0,
                borderWidth: 0,
              }
            : {
                opacity: 1,
                scale: 1,
                x: 0,
                y: 0,
                bottom: 0,
                right: 0,
                width: "100%",
                maxWidth: "min(72rem, calc(100vw - 2rem))",
                height: "80%",
                borderTopLeftRadius: 8,
                borderWidth: 1,
              }
        }
        exit={{ opacity: 0, scale: 0.98, x: 10, y: 10 }}
        transition={drawerTransition}
        style={{
          minHeight: "24rem",
          borderColor: "var(--border)",
          borderStyle: "solid",
        }}
      >
        {expanded ? (
          expandedContent
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {icon && (
                  <div className="shrink-0 text-foreground/70">{icon}</div>
                )}
                {typeof name === "string" ? (
                  <p className="text-lg font-semibold truncate">{name}</p>
                ) : (
                  name
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                data-testid="service.drawer.close"
              >
                <XIcon className="size-4" />
              </Button>
            </div>

            {tabs.length > 0 && (
              <ServiceDrawerTabs
                key={initialTab}
                initialTab={initialTab}
                tabs={tabs}
                banner={banner}
              />
            )}

            {footer}
          </>
        )}
      </motion.div>
    </>
  );
}

function ServiceDrawerTabs({
  initialTab,
  tabs,
  banner,
}: {
  initialTab?: string;
  tabs: DrawerTab[];
  banner?: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex flex-col flex-1 min-h-0"
    >
      {tabs.length > 1 && (
        <TabsList
          variant="line"
          className="px-6 border-b !w-full !justify-start [&>*]:!flex-none [&>*]:mb-[-1px]"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              data-testid={`service.drawer.tab.${tab.id}`}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
      {banner}
      {tabs.map((tab) => (
        <TabsContent
          key={tab.id}
          value={tab.id}
          className="flex-1 min-h-0 px-6 pt-4 pb-6"
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
