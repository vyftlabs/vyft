package httpx

import (
	"encoding/json"
	"net/http"
)

func NotImplemented(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"code":    "INTERNAL",
		"message": "not implemented",
	})
}
