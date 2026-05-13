# Spike: Loki queries
Validate the Loki HTTP API shape for live tail and range search.

Acceptance:
- Working LogQL captured for: tail (`/loki/api/v1/tail`), range query (`/loki/api/v1/query_range`), instant query (`/loki/api/v1/query`).
- Confirm label selector: `{k8s_namespace_name="<ns>", k8s_pod_name=~"<resource>-.*"}`.
- Document response shape (`streams[]` w/ `stream` labels + `values[][ts_ns, line]`).
- Decide tail transport: HTTP long-poll vs the `/tail` websocket. Polling preferred v1 for simpler client lifecycle.

Notes: blocks `backend-loki`. Feeds query templates inline into the impl story.
