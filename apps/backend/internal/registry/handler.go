package registry

import (
	"context"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
)

type Handler struct{ svc *Service }

func NewHandler(s *Service) *Handler { return &Handler{svc: s} }

func toWire(r sqlc.Registry) openapi.Registry {
	return openapi.Registry{
		Id:        openapi_types.UUID(uuid.UUID(r.ID.Bytes)),
		Name:      r.Name,
		Url:       r.Url,
		Username:  r.Username,
		CreatedAt: r.Created.Time,
		UpdatedAt: r.Updated.Time,
	}
}

func (h *Handler) ListRegistries(ctx context.Context, _ openapi.ListRegistriesRequestObject) (openapi.ListRegistriesResponseObject, error) {
	rows, err := h.svc.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]openapi.Registry, len(rows))
	for i, r := range rows {
		out[i] = toWire(r)
	}
	return openapi.ListRegistries200JSONResponse(out), nil
}

func (h *Handler) CreateRegistry(ctx context.Context, req openapi.CreateRegistryRequestObject) (openapi.CreateRegistryResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	row, err := h.svc.Create(ctx, *req.Body)
	if err != nil {
		return nil, err
	}
	return openapi.CreateRegistry201JSONResponse(toWire(row)), nil
}

func (h *Handler) DeleteRegistry(ctx context.Context, req openapi.DeleteRegistryRequestObject) (openapi.DeleteRegistryResponseObject, error) {
	if err := h.svc.Delete(ctx, uuid.UUID(req.Id)); err != nil {
		return nil, err
	}
	return openapi.DeleteRegistry204Response{}, nil
}
