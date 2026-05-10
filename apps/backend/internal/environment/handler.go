package environment

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

func toWire(e sqlc.Environment) openapi.Environment {
	return openapi.Environment{
		Id:        openapi_types.UUID(uuid.UUID(e.ID.Bytes)),
		ProjectId: openapi_types.UUID(uuid.UUID(e.ProjectID.Bytes)),
		Slug:      e.Slug,
		CreatedAt: e.Created.Time,
	}
}

func (h *Handler) ListEnvironments(ctx context.Context, req openapi.ListEnvironmentsRequestObject) (openapi.ListEnvironmentsResponseObject, error) {
	rows, err := h.svc.List(ctx, uuid.UUID(req.ProjectId))
	if err != nil {
		return nil, err
	}
	out := make([]openapi.Environment, len(rows))
	for i, e := range rows {
		out[i] = toWire(e)
	}
	return openapi.ListEnvironments200JSONResponse(out), nil
}

func (h *Handler) GetEnvironment(ctx context.Context, req openapi.GetEnvironmentRequestObject) (openapi.GetEnvironmentResponseObject, error) {
	row, err := h.svc.Get(ctx, uuid.UUID(req.Id))
	if err != nil {
		return nil, err
	}
	return openapi.GetEnvironment200JSONResponse(toWire(row)), nil
}

func (h *Handler) CreateEnvironment(ctx context.Context, req openapi.CreateEnvironmentRequestObject) (openapi.CreateEnvironmentResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	row, err := h.svc.Create(ctx, uuid.UUID(req.ProjectId), req.Body.Slug)
	if err != nil {
		return nil, err
	}
	return openapi.CreateEnvironment201JSONResponse(toWire(row)), nil
}

func (h *Handler) DeleteEnvironment(ctx context.Context, req openapi.DeleteEnvironmentRequestObject) (openapi.DeleteEnvironmentResponseObject, error) {
	if err := h.svc.Delete(ctx, uuid.UUID(req.Id)); err != nil {
		return nil, err
	}
	return openapi.DeleteEnvironment204Response{}, nil
}
