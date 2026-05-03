package observability

import (
	"net/http"

	"github.com/vyftlabs/vyft/apps/backend/internal/httpx"
)

func Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /projects/{projectId}/resources/{resourceId}/events", handleListEvents)
	mux.HandleFunc("GET /projects/{projectId}/resources/{resourceId}/logs", handleListLogs)
	mux.HandleFunc("GET /projects/{projectId}/resources/{resourceId}/metrics", handleGetMetrics)
}

func handleListEvents(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
func handleListLogs(w http.ResponseWriter, r *http.Request)   { httpx.NotImplemented(w, r) }
func handleGetMetrics(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
