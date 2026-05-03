package deployments

import (
	"net/http"

	"github.com/vyftlabs/vyft/apps/backend/internal/httpx"
)

func Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /projects/{projectId}/deployments", handleCreate)
	mux.HandleFunc("GET /projects/{projectId}/deployments/checksum", handleGetChecksum)
	mux.HandleFunc("GET /projects/{projectId}/deployments/latest", handleGetLatest)
}

func handleCreate(w http.ResponseWriter, r *http.Request)      { httpx.NotImplemented(w, r) }
func handleGetChecksum(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
func handleGetLatest(w http.ResponseWriter, r *http.Request)   { httpx.NotImplemented(w, r) }
