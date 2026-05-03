package routes

import (
	"net/http"

	"github.com/vyftlabs/vyft/apps/backend/internal/httpx"
)

func Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /projects/{projectId}/services/{serviceId}/routes", handleList)
	mux.HandleFunc("POST /projects/{projectId}/services/{serviceId}/routes", handleCreate)
	mux.HandleFunc("PATCH /projects/{projectId}/routes/{id}", handleUpdate)
	mux.HandleFunc("DELETE /projects/{projectId}/routes/{id}", handleDelete)
}

func handleList(w http.ResponseWriter, r *http.Request)   { httpx.NotImplemented(w, r) }
func handleCreate(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
func handleUpdate(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
func handleDelete(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
