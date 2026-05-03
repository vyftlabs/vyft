package resources

import (
	"net/http"

	"github.com/vyftlabs/vyft/apps/backend/internal/httpx"
)

func Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /projects/{projectId}/resources", handleList)
	mux.HandleFunc("POST /projects/{projectId}/resources", handleCreate)
	mux.HandleFunc("GET /projects/{projectId}/resources/{id}", handleGet)
	mux.HandleFunc("PATCH /projects/{projectId}/resources/{id}", handleUpdate)
	mux.HandleFunc("DELETE /projects/{projectId}/resources/{id}", handleDelete)
	mux.HandleFunc("PATCH /projects/{projectId}/resources/{id}/position", handleUpdatePosition)
}

func handleList(w http.ResponseWriter, r *http.Request)           { httpx.NotImplemented(w, r) }
func handleCreate(w http.ResponseWriter, r *http.Request)         { httpx.NotImplemented(w, r) }
func handleGet(w http.ResponseWriter, r *http.Request)            { httpx.NotImplemented(w, r) }
func handleUpdate(w http.ResponseWriter, r *http.Request)         { httpx.NotImplemented(w, r) }
func handleDelete(w http.ResponseWriter, r *http.Request)         { httpx.NotImplemented(w, r) }
func handleUpdatePosition(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
