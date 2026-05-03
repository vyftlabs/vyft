import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { useParams } from "react-router"
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  applyNodeChanges,
  Background,
  BackgroundVariant,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { PlusIcon, WandSparklesIcon } from "lucide-react"
import dagre from "dagre"
import { AnimatePresence } from "motion/react"
import { ServiceNode } from "@/components/services/node"
import type { ServiceNodeData } from "@/components/services/node"
import { ServiceDrawer } from "@/components/services/drawer/service-drawer"
import { AddResourceDialog } from "@/components/add-resource-dialog"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as api from "@/lib/api"

const nodeTypes = { service: ServiceNode }

const NODE_WIDTH = 200
const NODE_HEIGHT = 60

function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120 })

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id)
    return { ...node, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } }
  })
}

export default function Services() {
  return (
    <ReactFlowProvider>
      <ServicesCanvas />
    </ReactFlowProvider>
  )
}

function ServicesCanvas() {
  const { project } = useParams()
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [creatingService, setCreatingService] = useState(false)
  const [drawerKey, setDrawerKey] = useState(0)

  const queryClient = useQueryClient()
  const { data: projectData } = useQuery({
    ...api.projects.bySlug(project!),
    enabled: !!project,
  })
  const projectId = projectData?.id ?? ""

  const resourceQuery = useQuery({
    ...api.resources.list(projectId),
    enabled: !!projectId,
  })
  const resources = resourceQuery.data ?? []
  const resourcesReady = resourceQuery.isSuccess
  const isEmpty = resourcesReady && resources.length === 0

  const { data: references = [] } = useQuery({
    ...api.variables.references(projectId),
    enabled: !!projectId,
  })

  const edges: Edge[] = useMemo(() => {
    const seen = new Set<string>()
    return references
      .filter((ref) => {
        const key = `${ref.sourceResourceId}-${ref.targetResourceId}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((ref) => ({
        id: `${ref.sourceResourceId}-${ref.targetResourceId}`,
        source: ref.targetResourceId,
        target: ref.sourceResourceId,
        type: "smoothstep",
        markerEnd: { type: "arrowclosed" as const, width: 14, height: 14, color: "var(--color-muted-foreground)" },
        style: { stroke: "var(--color-muted-foreground)", strokeWidth: 1.5 },
      }))
  }, [references])

  useEffect(() => {
    if (isEmpty && !addDialogOpen && !creatingService) {
      setAddDialogOpen(true)
    }
  }, [isEmpty, addDialogOpen, creatingService])

  const updatePosition = useMutation(api.resources.updatePosition)

  const resourceIds = resources.map((r) => r.id).join(",")

  const [nodes, setNodes] = useState<Node[]>([])

  useEffect(() => {
    setNodes(resources.map((r) => {
      const image = r.service?.app?.source?.image
      return {
        id: r.id,
        position: { x: r.positionX, y: r.positionY },
        type: "service",
        data: {
          label: r.name,
          image,
          status: { state: "running" },
          onHover: () => queryClient.prefetchQuery(api.resources.byId(projectId, r.id)),
        } satisfies ServiceNodeData,
      }
    }))
  }, [resourceIds])

  const { fitView } = useReactFlow()

  const onAutoLayout = useCallback(() => {
    setNodes((nds) => {
      const laid = autoLayout(nds, edges)
      for (const node of laid) {
        updatePosition.mutate({
          projectId,
          id: node.id,
          body: { positionX: node.position.x, positionY: node.position.y },
        })
      }
      return laid
    })
    requestAnimationFrame(() => fitView({ padding: 0.3, maxZoom: 1, duration: 300 }))
  }, [edges, updatePosition, fitView])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    updatePosition.mutate({
      projectId,
      id: node.id,
      body: { positionX: node.position.x, positionY: node.position.y },
    })
  }, [updatePosition])

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {(!resourcesReady || isEmpty || addDialogOpen) && (
        <div className="absolute inset-0 z-10 bg-black/5 backdrop-blur-[1px]" />
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_, node) => { setSelectedId(node.id); setDrawerKey((k) => k + 1) }}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        zoomOnScroll
        panOnScroll
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="color-mix(in oklch, var(--border), var(--muted-foreground) 25%)" />
      </ReactFlow>

      {resourcesReady && !isEmpty && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <button
            className="size-8 rounded-md border bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={onAutoLayout}
            title="Auto layout"
          >
            <WandSparklesIcon className="size-3.5" />
          </button>
          <button
            className="h-8 px-3 rounded-md border bg-background flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={() => setAddDialogOpen(true)}
            data-testid="service-add-button"
          >
            <PlusIcon className="size-3.5" />
            Add resource
          </button>
        </div>
      )}

      <AnimatePresence>
        <ServiceDrawer
          key={`${drawerKey}-${selectedId ?? "create"}`}
          resourceId={selectedId}
          creating={creatingService}
          project={project!}
          projectId={projectId}
          onClose={() => {
            setSelectedId(null)
            setCreatingService(false)
            if (isEmpty) setAddDialogOpen(true)
          }}
          onCreated={() => { setCreatingService(false); setSelectedId(null) }}
        />
      </AnimatePresence>

      <AddResourceDialog
        open={addDialogOpen}
        onOpenChange={isEmpty ? undefined : setAddDialogOpen}
        dismissible={!isEmpty}
        container={containerRef.current}
        onSelect={() => {
          setAddDialogOpen(false)
          setSelectedId(null)
          setCreatingService(true)
          setDrawerKey((k) => k + 1)
        }}
      />
    </div>
  )
}
