import { motion } from "motion/react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface DrawerTab {
  id: string;
  label: string;
  content: React.ReactNode;
  onHover?: () => void;
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
  logsArea?: React.ReactNode;
}

export function Overview({ metricsArea, logsArea }: OverviewProps) {
  const showLogs = logsArea !== undefined;
  return (
    <div className="flex flex-col gap-5 h-full">
      {metricsArea && (
        <div className="space-y-2 shrink-0">
          <p className="text-xs font-medium">Metrics</p>
          {metricsArea}
        </div>
      )}
      {showLogs && <div className="flex-1 min-h-0">{logsArea}</div>}
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
            <div className="flex items-center px-6 py-4 shrink-0">
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
              onMouseEnter={tab.onHover}
              onFocus={tab.onHover}
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
