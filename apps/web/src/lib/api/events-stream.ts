import { useQueryClient } from "@tanstack/react-query";
import type { ServiceEvent } from "@vyft/spec";
import { useEffect } from "react";
import { events } from "./observability";

// mergeEvents upserts a batch into the cached list, keyed by id (k8s event UID
// is stable, so a MODIFIED event updates its count in place). Kept sorted
// oldest-first to match the REST backlog ordering.
function mergeEvents(
  prev: ServiceEvent[] | undefined,
  batch: ServiceEvent[],
): ServiceEvent[] {
  const byId = new Map((prev ?? []).map((e) => [e.id, e]));
  for (const e of batch) byId.set(e.id, e);
  return [...byId.values()].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

// useResourceEventsStream subscribes to the SSE event feed and merges each
// pushed batch into the resource's event-list cache. Same-origin EventSource
// replays Basic-auth creds; it auto-reconnects, and the reconnect re-sends the
// backlog (upsert is idempotent). The list query keeps a poll fallback.
export function useResourceEventsStream(
  projectId: string,
  resourceId: string,
  enabled = true,
) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || !projectId || !resourceId) return;
    const es = new EventSource(
      `/api/sse/projects/${projectId}/resources/${resourceId}/events`,
    );
    es.onmessage = (e) => {
      let batch: ServiceEvent[];
      try {
        batch = JSON.parse(e.data);
      } catch {
        return;
      }
      if (!batch?.length) return;
      qc.setQueryData(events(projectId, resourceId).queryKey, (old) =>
        mergeEvents(old as ServiceEvent[] | undefined, batch),
      );
    };
    return () => es.close();
  }, [enabled, projectId, resourceId, qc]);
}
