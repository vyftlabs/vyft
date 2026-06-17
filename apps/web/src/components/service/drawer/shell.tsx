import { Maximize2Icon, Minimize2Icon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface DrawerTab {
  id: string;
  label: string;
  content: React.ReactNode;
  onHover?: () => void;
  // Optional control rendered right-aligned in the tab bar while this tab
  // is active (e.g. the Metrics range selector).
  headerRight?: React.ReactNode;
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
  deploymentsArea?: React.ReactNode;
}

export function Overview({
  metricsArea,
  logsArea,
  deploymentsArea,
}: OverviewProps) {
  const showLogs = logsArea !== undefined;
  return (
    <div className="flex flex-col gap-5 h-full">
      {metricsArea && (
        <div className="shrink-0 border-b pb-5">{metricsArea}</div>
      )}
      {showLogs && (
        <div className="flex-1 min-h-0 flex gap-5">
          <div className="flex-1 min-w-0">{logsArea}</div>
          {deploymentsArea && (
            <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
              {deploymentsArea}
            </div>
          )}
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
  // Internal full-screen toggle (the header maximize button). Distinct from
  // the external `expanded` prop, which swaps in `expandedContent` wholesale.
  const [fullscreen, setFullscreen] = useState(false);
  const isFull = expanded || fullscreen;

  // Animate maxWidth in pixels: motion can't interpolate calc()/min() CSS
  // strings, which caused the width to snap/overshoot mid-transition. Track
  // the viewport width and resolve the docked cap (min(72rem, vw - 2rem)).
  const [vw, setVw] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const dockedMaxW = Math.min(1152, vw - 32); // 72rem, 2rem gutter

  return (
    <>
      <motion.div
        className="absolute inset-0 z-40 bg-black/5"
        initial={skipEntryAnimation ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={isFull ? undefined : onClose}
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
                maxWidth: dockedMaxW,
                height: "80%",
                borderTopLeftRadius: 8,
                borderWidth: 1,
              }
        }
        animate={
          isFull
            ? {
                opacity: 1,
                scale: 1,
                x: 0,
                y: 0,
                bottom: 0,
                right: 0,
                width: "100%",
                maxWidth: vw,
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
                maxWidth: dockedMaxW,
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
            <div className="flex items-center gap-2 px-6 py-4 shrink-0">
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
              <button
                type="button"
                onClick={() => setFullscreen((v) => !v)}
                aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                data-testid="service.drawer.fullscreen"
                className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {fullscreen ? (
                  <Minimize2Icon className="size-4" />
                ) : (
                  <Maximize2Icon className="size-4" />
                )}
              </button>
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
  const headerRight = tabs.find((t) => t.id === activeTab)?.headerRight;

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
          {headerRight && (
            <div className="ml-auto self-end !mb-1.5">{headerRight}</div>
          )}
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
