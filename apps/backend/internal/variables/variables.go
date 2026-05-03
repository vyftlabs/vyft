package variables

import (
	"net/http"

	"github.com/vyftlabs/vyft/apps/backend/internal/httpx"
)

func Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /projects/{projectId}/variables", handleList)
	mux.HandleFunc("POST /projects/{projectId}/variables", handleCreate)
	mux.HandleFunc("GET /projects/{projectId}/variables/references", handleListReferences)
	mux.HandleFunc("GET /projects/{projectId}/variables/suggestions", handleListSuggestions)
	mux.HandleFunc("GET /projects/{projectId}/variables/{id}", handleGet)
	mux.HandleFunc("PATCH /projects/{projectId}/variables/{id}", handleUpdate)
	mux.HandleFunc("DELETE /projects/{projectId}/variables/{id}", handleDelete)
}

func handleList(w http.ResponseWriter, r *http.Request)            { httpx.NotImplemented(w, r) }
func handleCreate(w http.ResponseWriter, r *http.Request)          { httpx.NotImplemented(w, r) }
func handleListReferences(w http.ResponseWriter, r *http.Request)  { httpx.NotImplemented(w, r) }
func handleListSuggestions(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
func handleGet(w http.ResponseWriter, r *http.Request)             { httpx.NotImplemented(w, r) }
func handleUpdate(w http.ResponseWriter, r *http.Request)          { httpx.NotImplemented(w, r) }
func handleDelete(w http.ResponseWriter, r *http.Request)          { httpx.NotImplemented(w, r) }
