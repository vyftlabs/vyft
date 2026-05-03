package registries

import (
	"net/http"

	"github.com/vyftlabs/vyft/apps/backend/internal/httpx"
)

func Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /registries", handleList)
	mux.HandleFunc("POST /registries", handleCreate)
	mux.HandleFunc("DELETE /registries/{id}", handleDelete)
}

func handleList(w http.ResponseWriter, r *http.Request)   { httpx.NotImplemented(w, r) }
func handleCreate(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
func handleDelete(w http.ResponseWriter, r *http.Request) { httpx.NotImplemented(w, r) }
