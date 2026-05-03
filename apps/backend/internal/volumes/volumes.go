package volumes

import (
	"net/http"

	"github.com/vyftlabs/vyft/apps/backend/internal/httpx"
)

func Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /projects/{projectId}/services/{serviceId}/volumes", handleList)
	mux.HandleFunc("POST /projects/{projectId}/services/{serviceId}/volumes", handleCreate)
	mux.HandleFunc("DELETE /projects/{projectId}/volumes/{id}", handleDelete)
}

func handleList(w http.ResponseWriter, r *http.Request)   { httpx.NotImplemented(w, r) }
func handleCreate(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
func handleDelete(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
