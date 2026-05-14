import {
  Background,
  BackgroundVariant,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "react-router";
import "@xyflow/react/dist/style.css";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { PlusIcon, WandSparklesIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import type { ServiceNodeData } from "@/components/service/node";
import { ServiceNode } from "@/components/service/node";
import * as api from "@/lib/api";
import { getAppSpec } from "@/lib/resource";

const ServiceDrawer = lazy(() =>
  import("@/components/service/drawer").then((m) => ({
    default: m.ServiceDrawer,
  })),
);
const AddResourceDialog = lazy(() =>
  import("@/components/resource/add").then((m) => ({
    default: m.AddResourceDialog,
  })),
);
const ResourcePickerPopover = lazy(() =>
  import("@/components/resource/picker").then((m) => ({
    default: m.ResourcePickerPopover,
  })),
);
const NodeContextMenu = lazy(() =>
  import("@/components/service/node-menu").then((m) => ({
    default: m.NodeContextMenu,
  })),
);

const nodeTypes = { service: ServiceNode };

const NODE_WIDTH = 200;
const NODE_HEIGHT = 60;

async function autoLayout(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  const { default: dagre } = await import("dagre");
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });
}

export default function Services() {
  return (
    <ReactFlowProvider>
      <ServicesCanvas />
    </ReactFlowProvider>
  );
}

function ServicesCanvas() {
  const { project } = useParams();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [creatingService, setCreatingService] = useState(false);
  const [drawerKey, setDrawerKey] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [createPosition, setCreatePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);

  const queryClient = useQueryClient();
  const { data: projectData } = useQuery({
    ...api.projects.bySlug(project ?? ""),
    enabled: !!project,
  });
  const projectId = projectData?.id ?? "";

  const resourceQuery = useQuery({
    ...api.resources.list(projectId),
    enabled: !!projectId,
  });
  const resources = useMemo(
    () => resourceQuery.data ?? [],
    [resourceQuery.data],
  );
  const resourcesReady = resourceQuery.isSuccess;
  const isEmpty = resourcesReady && resources.length === 0;
  const resourceDialogOpen = isEmpty || addDialogOpen;

  // Derive cross-resource variable references client-side: for each resource,
  // list its env (owned + imported) and pick imported entries whose source
  // belongs to a different resource. One parallel fetch per resource.
  const envQueries = useQueries({
    queries: resources.map((r) => ({
      ...api.variables.resource.list(projectId, r.id),
      enabled: !!projectId,
    })),
  });

  const edges: Edge[] = useMemo(() => {
    const seen = new Set<string>();
    const out: Edge[] = [];
    envQueries.forEach((q, i) => {
      const targetResourceId = resources[i]?.id;
      if (!targetResourceId) return;
      for (const v of q.data ?? []) {
        if (v.kind !== "imported") continue;
        const sourceResourceId = v.source?.resource?.id;
        if (!sourceResourceId || sourceResourceId === targetResourceId) continue;
        const key = `${sourceResourceId}-${targetResourceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: key,
          source: targetResourceId,
          target: sourceResourceId,
          type: "smoothstep",
          markerEnd: {
            type: "arrowclosed" as const,
            width: 14,
            height: 14,
            color: "var(--color-muted-foreground)",
          },
          style: {
            stroke: "var(--color-muted-foreground)",
            strokeWidth: 1.5,
          },
        });
      }
    });
    return out;
  }, [envQueries, resources]);

  const updateResource = useMutation(api.resources.update);
  const removeResource = useMutation(api.resources.remove);

  // ReactFlow owns node state internally via useNodesState — drags work
  // through applyNodeChanges (built into the returned onNodesChange) so
  // measured dimensions and selection survive re-renders. We sync from
  // server data via useEffect, preserving in-flight drag positions.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  useEffect(() => {
    setNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n] as const));
      return resources.map((r) => {
        const image = getAppSpec(r)?.source.image;
        const data: ServiceNodeData = {
          label: r.name,
          image,
          status: { state: "running" },
          onHover: () => {
            // staleTime on prefetchQuery makes it a no-op when cached
            // data is still fresh — repeated hovers don't re-fetch. Cast
            // at the call site: queryOptions() yields a mutable queryKey
            // signature that doesn't widen to prefetchQuery's readonly.
            const prefetch = (opts: { queryKey: readonly unknown[] }) =>
              queryClient.prefetchQuery({
                ...(opts as unknown as Parameters<
                  typeof queryClient.prefetchQuery
                >[0]),
                staleTime: 60_000,
              });
            prefetch(api.resources.byId(projectId, r.id));
            prefetch(api.observability.events(projectId, r.id));
            prefetch(api.observability.logsCapabilities(projectId, r.id));
            prefetch(api.observability.cpuMetrics(projectId, r.id));
            prefetch(api.observability.memoryMetrics(projectId, r.id));
            prefetch(api.observability.requestRateMetrics(projectId, r.id));
            prefetch(api.observability.errorRateMetrics(projectId, r.id));
            prefetch(api.observability.latencyMetrics(projectId, r.id));
          },
        };
        const existing = byId.get(r.id);
        return {
          id: r.id,
          // Keep the live drag position if user moved the node since last sync.
          position: existing?.position ?? { x: r.positionX, y: r.positionY },
          type: "service",
          data,
        };
      });
    });
  }, [resources, projectId, queryClient, setNodes]);

  const { fitView, screenToFlowPosition } = useReactFlow();

  const onAutoLayout = useCallback(async () => {
    const laid = await autoLayout(nodes, edges);
    setNodes(laid);
    for (const node of laid) {
      updateResource.mutate({
        projectId,
        id: node.id,
        body: {
          positionX: node.position.x,
          positionY: node.position.y,
        },
      });
    }
    requestAnimationFrame(() =>
      fitView({ padding: 0.3, maxZoom: 1, duration: 300 }),
    );
  }, [nodes, edges, setNodes, updateResource, fitView, projectId]);

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      updateResource.mutate({
        projectId,
        id: node.id,
        body: {
          positionX: node.position.x,
          positionY: node.position.y,
        },
      });
    },
    [updateResource, projectId],
  );

  return (
    <div
      ref={setContainer}
      className="relative h-full w-full"
      data-testid="service.canvas"
    >
      {(!resourcesReady || resourceDialogOpen) && (
        <div className="absolute inset-0 z-10 bg-black/5 backdrop-blur-[0.5px]" />
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_, node) => {
          setSelectedId(node.id);
          setDrawerKey((k) => k + 1);
        }}
        onPaneContextMenu={(e) => {
          if (isEmpty) return;
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
        onNodeContextMenu={(e, node) => {
          if (isEmpty) return;
          e.preventDefault();
          setNodeMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
        }}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        zoomOnScroll
        panOnScroll
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={2}
          color="color-mix(in oklch, var(--border), var(--muted-foreground) 25%)"
        />
      </ReactFlow>

      {resourcesReady && !isEmpty && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <button
            type="button"
            className="size-8 rounded-md border bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={onAutoLayout}
            title="Auto layout"
            data-testid="service.canvas.layout"
          >
            <WandSparklesIcon className="size-3.5" />
          </button>
          <button
            type="button"
            className="h-8 px-3 rounded-md border bg-background flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={() => setAddDialogOpen(true)}
            data-testid="service.canvas.add"
          >
            <PlusIcon className="size-3.5" />
            Add resource
          </button>
        </div>
      )}

      <AnimatePresence>
        {(selectedId || creatingService) && (
          <Suspense fallback={null}>
            <ServiceDrawer
              key={drawerKey}
              resourceId={selectedId}
              creating={creatingService}
              createPosition={createPosition ?? undefined}
              project={project ?? ""}
              projectId={projectId}
              onClose={() => {
                setSelectedId(null);
                setCreatingService(false);
                setCreatePosition(null);
              }}
              onCreated={() => {
                setSelectedId(null);
                setCreatingService(false);
                setCreatePosition(null);
              }}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {resourceDialogOpen && (
        <Suspense fallback={null}>
          <AddResourceDialog
            open={resourceDialogOpen}
            onOpenChange={isEmpty ? undefined : setAddDialogOpen}
            dismissible={!isEmpty}
            container={container}
            onSelect={() => {
              setAddDialogOpen(false);
              setSelectedId(null);
              setCreatingService(true);
              setDrawerKey((k) => k + 1);
            }}
          />
        </Suspense>
      )}

      {nodeMenu && (
        <Suspense fallback={null}>
          <NodeContextMenu
            x={nodeMenu.x}
            y={nodeMenu.y}
            onClose={() => setNodeMenu(null)}
            onOpen={() => {
              setSelectedId(nodeMenu.nodeId);
              setDrawerKey((k) => k + 1);
              setNodeMenu(null);
            }}
            onDelete={() => {
              removeResource.mutate({ projectId, id: nodeMenu.nodeId });
              if (selectedId === nodeMenu.nodeId) setSelectedId(null);
              setNodeMenu(null);
            }}
          />
        </Suspense>
      )}

      {contextMenu && (
        <Suspense fallback={null}>
          <ResourcePickerPopover
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            onSelect={() => {
              const flow = screenToFlowPosition({
                x: contextMenu.x,
                y: contextMenu.y,
              });
              setCreatePosition({
                x: flow.x - NODE_WIDTH / 2,
                y: flow.y - NODE_HEIGHT / 2,
              });
              setContextMenu(null);
              setSelectedId(null);
              setCreatingService(true);
              setDrawerKey((k) => k + 1);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
