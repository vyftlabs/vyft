package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"

	vdb "github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
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
