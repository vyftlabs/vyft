package projects

import (
	"net/http"

	"github.com/vyftlabs/vyft/apps/backend/internal/httpx"
)

func Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /projects", handleList)
	mux.HandleFunc("POST /projects", handleCreate)
	mux.HandleFunc("GET /projects/{id}", handleGet)
	mux.HandleFunc("PATCH /projects/{id}", handleUpdate)
	mux.HandleFunc("DELETE /projects/{id}", handleDelete)
}

func handleList(w http.ResponseWriter, r *http.Request)   { httpx.NotImplemented(w, r) }
func handleCreate(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
func handleGet(w http.ResponseWriter, r *http.Request)    { httpx.NotImplemented(w, r) }
func handleUpdate(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
func handleDelete(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
