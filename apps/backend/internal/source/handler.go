// Package source stubs the source endpoints. Real implementation lands in
// story 0100 (CRUD handlers).
package source

import (
	"context"
	"errors"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) ListSources(_ context.Context, _ openapi.ListSourcesRequestObject) (openapi.ListSourcesResponseObject, error) {
	return openapi.ListSources200JSONResponse{}, nil
}

func (h *Handler) CreateSource(_ context.Context, _ openapi.CreateSourceRequestObject) (openapi.CreateSourceResponseObject, error) {
	return nil, errors.New("not implemented")
}

func (h *Handler) UpdateSource(_ context.Context, _ openapi.UpdateSourceRequestObject) (openapi.UpdateSourceResponseObject, error) {
	return nil, errors.New("not implemented")
}

func (h *Handler) DeleteSource(_ context.Context, _ openapi.DeleteSourceRequestObject) (openapi.DeleteSourceResponseObject, error) {
	return openapi.DeleteSource204Response{}, nil
}

func (h *Handler) PromoteSourceDefault(_ context.Context, _ openapi.PromoteSourceDefaultRequestObject) (openapi.PromoteSourceDefaultResponseObject, error) {
	return nil, errors.New("not implemented")
}
