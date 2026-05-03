package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

type helloResponse struct {
	Message string `json:"message"`
}

func handleHello(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	writeJSON(w, http.StatusOK, helloResponse{Message: "Hello, world!"})
}

func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, value helloResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Error("failed to write response", "error", err)
	}
}
