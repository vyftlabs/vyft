import { Maximize2Icon, Minimize2Icon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";

export interface DrawerTab {
  id: string;
  label: string;
  content: React.ReactNode;
  onHover?: () => void;
  // Fired on every click of the tab trigger (even when already active) — used
  // to reset a tab's internal drill-in (e.g. close the deployment detail).
  onActivate?: () => void;
  // Optional control rendered right-aligned in the tab bar while this tab
  // is active (e.g. the Metrics range selector).
  headerRight?: React.ReactNode;
}

export interface ServiceDrawerShellProps {
  name: React.ReactNode;
  icon?: React.ReactNode;
  tabs: DrawerTab[];
  defaultTab?: string;
  // Controlled active tab. When provided, the caller owns tab state (used to
  // switch tabs programmatically, e.g. opening a deployment from Overview).
  activeTab?: string;
  onTabChange?: (id: string) => void;
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
        <div className="flex-1 min-h-0 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 min-w-0 min-h-0">{logsArea}</div>
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
  activeTab,
  onTabChange,
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
  const isMobile = useIsMobile();
  // Mobile = full-width bottom sheet (no gutter, taller, both top corners
  // rounded). Desktop = docked bottom-right card capped at 72rem.
  const dockedMaxW = isMobile ? vw : Math.min(1152, vw - 32);
  const dockedHeight = isMobile ? "92%" : "80%";
  const dockedTopRadius = isMobile ? 16 : 8;
  const dockedRightRadius = isMobile ? 16 : 0;

  return (
    <>
      <motion.div
        className="absolute inset-0 z-40 bg-black/5"
        data-testid="service.drawer.backdrop"
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
                scale: isMobile ? 1 : 0.96,
                x: 0,
                y: isMobile ? 24 : 16,
                bottom: 0,
                right: 0,
                width: "100%",
                maxWidth: dockedMaxW,
                height: dockedHeight,
                borderTopLeftRadius: dockedTopRadius,
                borderTopRightRadius: dockedRightRadius,
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
                borderTopRightRadius: 0,
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
                height: dockedHeight,
                borderTopLeftRadius: dockedTopRadius,
                borderTopRightRadius: dockedRightRadius,
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
            <div className="flex items-center gap-2 px-4 sm:px-6 py-4 shrink-0">
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
              {/* Full-screen toggle is desktop-only; the mobile sheet is already
                  effectively full-bleed. */}
              {!isMobile && (
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
              )}
            </div>

            {tabs.length > 0 && (
              <ServiceDrawerTabs
                key={initialTab}
                initialTab={initialTab}
                activeTab={activeTab}
                onTabChange={onTabChange}
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
  activeTab: controlledTab,
  onTabChange,
  tabs,
  banner,
}: {
  initialTab?: string;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  tabs: DrawerTab[];
  banner?: React.ReactNode;
}) {
  const [internalTab, setInternalTab] = useState(initialTab);
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = onTabChange ?? setInternalTab;
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
          className="px-4 sm:px-6 border-b !w-full !justify-start [&>*]:!flex-none [&>*]:mb-[-1px]"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              data-testid={`service.drawer.tab.${tab.id}`}
              onMouseEnter={tab.onHover}
              onFocus={tab.onHover}
              onClick={tab.onActivate}
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
          className="flex-1 min-h-0 px-4 sm:px-6 pt-4 pb-6"
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
