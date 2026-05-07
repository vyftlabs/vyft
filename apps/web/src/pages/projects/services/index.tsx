import {
  Background,
  BackgroundVariant,
  type Edge,
  type Node,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useParams } from "react-router";
import "@xyflow/react/dist/style.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, WandSparklesIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import type { ServiceNodeData } from "@/components/service/node";
import { ServiceNode } from "@/components/service/node";
import * as api from "@/lib/api";

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

type NodePosition = { x: number; y: number };

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

  const { data: references = [] } = useQuery({
    ...api.variables.references(projectId),
    enabled: !!projectId,
  });

  const edges: Edge[] = useMemo(() => {
    const seen = new Set<string>();
    return references
      .filter((ref) => {
        const key = `${ref.sourceResourceId}-${ref.targetResourceId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((ref) => ({
        id: `${ref.sourceResourceId}-${ref.targetResourceId}`,
        source: ref.targetResourceId,
        target: ref.sourceResourceId,
        type: "smoothstep",
        markerEnd: {
          type: "arrowclosed" as const,
          width: 14,
          height: 14,
          color: "var(--color-muted-foreground)",
        },
        style: { stroke: "var(--color-muted-foreground)", strokeWidth: 1.5 },
      }));
  }, [references]);

  const updatePosition = useMutation(api.resources.updatePosition);
  const removeResource = useMutation(api.resources.remove);

  const baseNodes = useMemo(() => {
    return resources.map((r) => {
      const image = r.service?.app?.source?.image;
      return {
        id: r.id,
        position: { x: r.positionX, y: r.positionY },
        type: "service",
        data: {
          label: r.name,
          image,
          status: { state: "running" },
          onHover: () => {
            queryClient.prefetchQuery(api.resources.byId(projectId, r.id));
            queryClient.prefetchQuery(
              api.observability.events(projectId, r.id),
            );
            queryClient.prefetchQuery(
              api.observability.logs(projectId, r.id, 50),
            );
            queryClient.prefetchQuery(
              api.observability.metrics(projectId, r.id),
            );
          },
        } satisfies ServiceNodeData,
      };
    });
  }, [resources, projectId, queryClient]);

  const [nodePositions, setNodePositions] = useState<
    Record<string, NodePosition>
  >({});

  const nodes = useMemo(
    () =>
      baseNodes.map((node) => ({
        ...node,
        position: nodePositions[node.id] ?? node.position,
      })),
    [baseNodes, nodePositions],
  );

  const { fitView, screenToFlowPosition } = useReactFlow();

  const onAutoLayout = useCallback(async () => {
    const laid = await autoLayout(nodes, edges);
    const nextPositions: Record<string, NodePosition> = {};
    for (const node of laid) {
      nextPositions[node.id] = node.position;
      updatePosition.mutate({
        projectId,
        id: node.id,
        body: { positionX: node.position.x, positionY: node.position.y },
      });
    }
    setNodePositions(nextPositions);
    requestAnimationFrame(() =>
      fitView({ padding: 0.3, maxZoom: 1, duration: 300 }),
    );
  }, [nodes, edges, updatePosition, fitView, projectId]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodePositions((current) => {
      let next = current;
      for (const change of changes) {
        if (change.type !== "position" || !change.position) continue;
        if (next === current) next = { ...current };
        next[change.id] = change.position;
      }
      return next;
    });
  }, []);

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      updatePosition.mutate({
        projectId,
        id: node.id,
        body: { positionX: node.position.x, positionY: node.position.y },
      });
    },
    [updatePosition, projectId],
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
              onCreated={(id) => {
                setSelectedId(id);
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
