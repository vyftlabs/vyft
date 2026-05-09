// Package httpx holds request/response helpers. Error type lives in apierr.
package httpx

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/google/uuid"

	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
)

func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("encode response", "error", err)
	}
}

func WriteError(w http.ResponseWriter, err error) {
	var apiErr *apierr.APIError
	if !errors.As(err, &apiErr) {
		apiErr = apierr.Internal(err)
	}
	WriteJSON(w, apiErr.Status, apiErr)
}

func NoContent(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNoContent)
}

func NotImplemented(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusNotImplemented, apierr.NotImplementedErr())
}

func DecodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return apierr.BadRequest("invalid JSON body: " + err.Error())
	}
	return nil
}

func PathUUID(r *http.Request, name string) (uuid.UUID, error) {
	raw := r.PathValue(name)
	if raw == "" {
		return uuid.Nil, apierr.BadRequest("missing path parameter " + name)
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, apierr.BadRequest("invalid uuid for " + name)
	}
	return id, nil
}

func PathString(r *http.Request, name string) (string, error) {
	v := r.PathValue(name)
	if v == "" {
		return "", apierr.BadRequest("missing path parameter " + name)
	}
	return v, nil
}
