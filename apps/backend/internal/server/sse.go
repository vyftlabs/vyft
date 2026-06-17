package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	vdb "github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/environment"
	"github.com/vyftlabs/vyft/apps/backend/internal/k8sevents"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
	k8srt "github.com/vyftlabs/vyft/apps/backend/internal/runtime/k8s"
	"github.com/vyftlabs/vyft/apps/backend/internal/status"
)

// SSE tuning.
const (
	// sseDebounce coalesces a burst of cluster events (a rollout fires many
	// pod updates) into a single push.
	sseDebounce = 250 * time.Millisecond
	// sseHeartbeat keeps the connection alive through idle-timeout proxies.
	sseHeartbeat = 25 * time.Second
)

type wireStatus struct {
	State   string `json:"state"`
	Message string `json:"message,omitempty"`
}

// statusSSEHandler streams a project's resource health to the browser over
// Server-Sent Events. Each message is the full status map keyed by resource
// slug — idempotent, so a reconnect needs no replay. Pushed on every
// (debounced) cluster change plus an initial snapshot on connect.
func statusSSEHandler(database *vdb.DB, w *status.Watcher) http.HandlerFunc {
	return func(rw http.ResponseWriter, r *http.Request) {
		pid, err := uuid.Parse(r.PathValue("projectId"))
		if err != nil {
			http.Error(rw, "bad project id", http.StatusBadRequest)
			return
		}
		proj, err := database.Q.GetProject(r.Context(), pgxid.PgUUID(pid))
		if err != nil {
			http.Error(rw, "project not found", http.StatusNotFound)
			return
		}
		slug := proj.Slug

		rc := http.NewResponseController(rw)
		rw.Header().Set("Content-Type", "text/event-stream")
		rw.Header().Set("Cache-Control", "no-cache")
		rw.Header().Set("Connection", "keep-alive")
		rw.Header().Set("X-Accel-Buffering", "no") // don't let nginx buffer the stream

		signal, unsub := w.Subscribe(slug)
		defer unsub()

		send := func() bool {
			payload, err := json.Marshal(toWireStatuses(w.Statuses(slug)))
			if err != nil {
				return false
			}
			if _, err := fmt.Fprintf(rw, "data: %s\n\n", payload); err != nil {
				return false
			}
			return rc.Flush() == nil
		}

		if !send() { // initial snapshot
			return
		}

		ctx := r.Context()
		debounce := time.NewTimer(0)
		if !debounce.Stop() {
			<-debounce.C
		}
		heartbeat := time.NewTicker(sseHeartbeat)
		defer heartbeat.Stop()
		pending := false

		for {
			select {
			case <-ctx.Done():
				return
			case <-signal:
				if !pending {
					pending = true
					debounce.Reset(sseDebounce)
				}
			case <-debounce.C:
				pending = false
				if !send() {
					return
				}
			case <-heartbeat.C:
				if _, err := fmt.Fprint(rw, ": ping\n\n"); err != nil {
					return
				}
				if rc.Flush() != nil {
					return
				}
			}
		}
	}
}

func toWireStatuses(in map[string]status.Status) map[string]wireStatus {
	out := make(map[string]wireStatus, len(in))
	for slug, st := range in {
		out[slug] = wireStatus{State: st.State, Message: st.Message}
	}
	return out
}

// wireEvent mirrors the spec ServiceEvent (camelCase JSON), so SSE messages
// and the REST list endpoint deserialize to the same frontend type.
type wireEvent struct {
	ID           string    `json:"id"`
	Type         string    `json:"type"`
	Reason       string    `json:"reason"`
	Message      string    `json:"message"`
	Timestamp    time.Time `json:"timestamp"`
	InvolvedKind string    `json:"involvedKind"`
	InvolvedName string    `json:"involvedName"`
	Count        int       `json:"count"`
	DeploymentID string    `json:"deploymentId,omitempty"`
}

// eventsSSEHandler streams a resource's Kubernetes events: an initial backlog
// (last ~1h) followed by each new event as it fires. Each message is a JSON
// array of events; the frontend upserts by id, so a reconnect re-sends the
// backlog and self-heals. On watch-channel close the handler returns and the
// browser's EventSource reconnects.
func eventsSSEHandler(database *vdb.DB, cs kubernetes.Interface) http.HandlerFunc {
	return func(rw http.ResponseWriter, r *http.Request) {
		rid, err := uuid.Parse(r.PathValue("resourceId"))
		if err != nil {
			http.Error(rw, "bad resource id", http.StatusBadRequest)
			return
		}
		ns, slug, err := resolveNamespaceSlug(r.Context(), database, rid)
		if err != nil {
			http.Error(rw, "resource not found", http.StatusNotFound)
			return
		}

		rc := http.NewResponseController(rw)
		rw.Header().Set("Content-Type", "text/event-stream")
		rw.Header().Set("Cache-Control", "no-cache")
		rw.Header().Set("Connection", "keep-alive")
		rw.Header().Set("X-Accel-Buffering", "no")

		ctx := r.Context()

		// Per-connection hash→deploymentId cache; new deploys are rare during a
		// stream so a miss-and-cache keeps lookups to one query per rollout.
		depByHash := map[string]string{}
		mkWire := func(e k8sevents.Event) wireEvent {
			w := wireEvent{
				ID:           e.ID,
				Type:         e.Type,
				Reason:       e.Reason,
				Message:      e.Message,
				Timestamp:    e.Timestamp,
				InvolvedKind: e.InvolvedKind,
				InvolvedName: e.InvolvedName,
				Count:        e.Count,
			}
			if hash := k8sevents.ParseHash(e.InvolvedName, slug); hash != "" {
				dep, ok := depByHash[hash]
				if !ok {
					if id, err := database.Q.FindDeploymentByRollout(ctx, sqlc.FindDeploymentByRolloutParams{
						ResourceID:      pgxid.PgUUID(rid),
						PodTemplateHash: hash,
					}); err == nil && id.Valid {
						dep = uuid.UUID(id.Bytes).String()
					}
					depByHash[hash] = dep
				}
				w.DeploymentID = dep
			}
			return w
		}

		sendBatch := func(evs []wireEvent) bool {
			payload, err := json.Marshal(evs)
			if err != nil {
				return false
			}
			if _, err := fmt.Fprintf(rw, "data: %s\n\n", payload); err != nil {
				return false
			}
			return rc.Flush() == nil
		}

		// Initial backlog.
		backlog, _ := k8sevents.List(ctx, cs, ns, slug)
		wire := make([]wireEvent, 0, len(backlog))
		for _, e := range backlog {
			wire = append(wire, mkWire(e))
		}
		if !sendBatch(wire) {
			return
		}

		w, err := cs.CoreV1().Events(ns).Watch(ctx, metav1.ListOptions{})
		if err != nil {
			return // backlog already delivered; browser will reconnect
		}
		defer w.Stop()
		results := w.ResultChan()

		heartbeat := time.NewTicker(sseHeartbeat)
		defer heartbeat.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case ev, ok := <-results:
				if !ok {
					return // watch closed — browser reconnects, re-lists
				}
				obj, ok := ev.Object.(*corev1.Event)
				if !ok || !k8sevents.Matches(obj, slug) {
					continue
				}
				if !sendBatch([]wireEvent{mkWire(k8sevents.Convert(obj))}) {
					return
				}
			case <-heartbeat.C:
				if _, err := fmt.Fprint(rw, ": ping\n\n"); err != nil {
					return
				}
				if rc.Flush() != nil {
					return
				}
			}
		}
	}
}

// resolveNamespaceSlug maps a resource id to its cluster namespace and slug.
func resolveNamespaceSlug(ctx context.Context, database *vdb.DB, resourceID uuid.UUID) (namespace, slug string, err error) {
	row, err := database.Q.GetResource(ctx, pgxid.PgUUID(resourceID))
	if err != nil {
		return "", "", err
	}
	proj, err := database.Q.GetProject(ctx, row.ProjectID)
	if err != nil {
		return "", "", err
	}
	return k8srt.NamespaceFor(proj.Slug, environment.DefaultSlug), row.Slug, nil
}
