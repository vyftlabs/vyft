// Source rows hold the active backend(s) per domain (metrics; future
// logs/traces). One row per domain carries is_default=true and is what
// the resolver returns for downstream feature handlers.
package crud

import (
	"context"

	"github.com/google/uuid"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
)

type Handler struct{ svc *Service }

func NewHandler(s *Service) *Handler { return &Handler{svc: s} }

func (h *Handler) ListSources(ctx context.Context, _ openapi.ListSourcesRequestObject) (openapi.ListSourcesResponseObject, error) {
	rows, err := h.svc.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]openapi.Source, len(rows))
	for i, r := range rows {
		wire, err := toWire(r)
		if err != nil {
			return nil, apierr.Internal(err)
		}
		out[i] = wire
	}
	return openapi.ListSources200JSONResponse(out), nil
}

func (h *Handler) CreateSource(ctx context.Context, req openapi.CreateSourceRequestObject) (openapi.CreateSourceResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	row, err := h.svc.Create(ctx, *req.Body)
	if err != nil {
		return nil, err
	}
	wire, err := toWire(row)
	if err != nil {
		return nil, apierr.Internal(err)
	}
	return openapi.CreateSource201JSONResponse(wire), nil
}

func (h *Handler) UpdateSource(ctx context.Context, req openapi.UpdateSourceRequestObject) (openapi.UpdateSourceResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	row, err := h.svc.Update(ctx, uuid.UUID(req.Id), *req.Body)
	if err != nil {
		return nil, err
	}
	wire, err := toWire(row)
	if err != nil {
		return nil, apierr.Internal(err)
	}
	return openapi.UpdateSource200JSONResponse(wire), nil
}

func (h *Handler) DeleteSource(ctx context.Context, req openapi.DeleteSourceRequestObject) (openapi.DeleteSourceResponseObject, error) {
	if err := h.svc.Delete(ctx, uuid.UUID(req.Id)); err != nil {
		return nil, err
	}
	return openapi.DeleteSource204Response{}, nil
}

func (h *Handler) PromoteSourceDefault(ctx context.Context, req openapi.PromoteSourceDefaultRequestObject) (openapi.PromoteSourceDefaultResponseObject, error) {
	row, err := h.svc.PromoteDefault(ctx, uuid.UUID(req.Id))
	if err != nil {
		return nil, err
	}
	wire, err := toWire(row)
	if err != nil {
		return nil, apierr.Internal(err)
	}
	return openapi.PromoteSourceDefault200JSONResponse(wire), nil
}
