import { useQueryClient } from "@tanstack/react-query";
import type { Resource, ServiceStatus } from "@vyft/spec";
import { useEffect } from "react";
import { list } from "./resources";

// useResourceStatusStream subscribes to the backend SSE status stream and
// merges live health into the cached resource list by slug. The browser
// replays its Basic-auth credentials for the same-origin request, so native
// EventSource needs no extra headers. EventSource auto-reconnects on drop;
// each message is the full status map, so a reconnect self-heals with no
// replay. The list query keeps a slow poll as a reconciliation fallback.
export function useResourceStatusStream(projectId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!projectId) return;
    const es = new EventSource(`/api/sse/projects/${projectId}/status`);
    es.onmessage = (e) => {
      let bySlug: Record<string, ServiceStatus>;
      try {
        bySlug = JSON.parse(e.data);
      } catch {
        return;
      }
      qc.setQueryData(
        list(projectId).queryKey,
        (old: Resource[] | undefined) =>
          old?.map((r) => ({ ...r, status: bySlug[r.slug] ?? r.status })),
      );
    };
    return () => es.close();
  }, [projectId, qc]);
}
