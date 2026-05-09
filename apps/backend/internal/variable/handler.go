package variable

import (
	"context"

	"github.com/google/uuid"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
)

type Handler struct{ svc *Service }

func NewHandler(s *Service) *Handler { return &Handler{svc: s} }

// ─── Shared ────────────────────────────────────────────────────────────────

func (h *Handler) ListVariables(ctx context.Context, req openapi.ListVariablesRequestObject) (openapi.ListVariablesResponseObject, error) {
	rows, err := h.svc.List(ctx, uuid.UUID(req.ProjectId))
	if err != nil {
		return nil, err
	}
	return openapi.ListVariables200JSONResponse(rows), nil
}

func (h *Handler) GetVariable(ctx context.Context, req openapi.GetVariableRequestObject) (openapi.GetVariableResponseObject, error) {
	row, err := h.svc.Get(ctx, uuid.UUID(req.Id))
	if err != nil {
		return nil, err
	}
	return openapi.GetVariable200JSONResponse(row), nil
}

func (h *Handler) CreateVariable(ctx context.Context, req openapi.CreateVariableRequestObject) (openapi.CreateVariableResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	row, err := h.svc.Create(ctx, uuid.UUID(req.ProjectId), *req.Body)
	if err != nil {
		return nil, err
	}
	return openapi.CreateVariable201JSONResponse(row), nil
}

func (h *Handler) UpdateVariable(ctx context.Context, req openapi.UpdateVariableRequestObject) (openapi.UpdateVariableResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	row, err := h.svc.Update(ctx, uuid.UUID(req.Id), *req.Body)
	if err != nil {
		return nil, err
	}
	return openapi.UpdateVariable200JSONResponse(row), nil
}

func (h *Handler) DeleteVariable(ctx context.Context, req openapi.DeleteVariableRequestObject) (openapi.DeleteVariableResponseObject, error) {
	if err := h.svc.Delete(ctx, uuid.UUID(req.Id)); err != nil {
		return nil, err
	}
	return openapi.DeleteVariable204Response{}, nil
}

// ─── Resource env ──────────────────────────────────────────────────────────

func (h *Handler) ListResourceVariables(ctx context.Context, req openapi.ListResourceVariablesRequestObject) (openapi.ListResourceVariablesResponseObject, error) {
	rows, err := h.svc.ListResourceEnv(ctx, uuid.UUID(req.ProjectId), uuid.UUID(req.ResourceId))
	if err != nil {
		return nil, err
	}
	return openapi.ListResourceVariables200JSONResponse(rows), nil
}

func (h *Handler) GetResourceVariable(ctx context.Context, req openapi.GetResourceVariableRequestObject) (openapi.GetResourceVariableResponseObject, error) {
	row, err := h.svc.GetResourceEnv(ctx, uuid.UUID(req.ProjectId), uuid.UUID(req.ResourceId), req.Key)
	if err != nil {
		return nil, err
	}
	return openapi.GetResourceVariable200JSONResponse(row), nil
}

func (h *Handler) CreateResourceVariable(ctx context.Context, req openapi.CreateResourceVariableRequestObject) (openapi.CreateResourceVariableResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	row, err := h.svc.CreateResourceEnv(ctx, uuid.UUID(req.ProjectId), uuid.UUID(req.ResourceId), *req.Body)
	if err != nil {
		return nil, err
	}
	return openapi.CreateResourceVariable201JSONResponse(row), nil
}

func (h *Handler) UpdateResourceVariable(ctx context.Context, req openapi.UpdateResourceVariableRequestObject) (openapi.UpdateResourceVariableResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	row, err := h.svc.UpdateResourceEnv(ctx, uuid.UUID(req.ProjectId), uuid.UUID(req.ResourceId), req.Key, *req.Body)
	if err != nil {
		return nil, err
	}
	return openapi.UpdateResourceVariable200JSONResponse(row), nil
}

func (h *Handler) DeleteResourceVariable(ctx context.Context, req openapi.DeleteResourceVariableRequestObject) (openapi.DeleteResourceVariableResponseObject, error) {
	if err := h.svc.DeleteResourceEnv(ctx, uuid.UUID(req.ProjectId), uuid.UUID(req.ResourceId), req.Key); err != nil {
		return nil, err
	}
	return openapi.DeleteResourceVariable204Response{}, nil
}
