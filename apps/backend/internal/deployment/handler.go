package deployment

import (
	"context"

	"github.com/google/uuid"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
)

type Handler struct{ svc *Service }

func NewHandler(s *Service) *Handler { return &Handler{svc: s} }

func (h *Handler) GetDeploymentChecksum(ctx context.Context, req openapi.GetDeploymentChecksumRequestObject) (openapi.GetDeploymentChecksumResponseObject, error) {
	out, err := h.svc.Checksum(ctx, uuid.UUID(req.ProjectId))
	if err != nil {
		return nil, err
	}
	return openapi.GetDeploymentChecksum200JSONResponse(out), nil
}

func (h *Handler) GetLatestDeployment(ctx context.Context, req openapi.GetLatestDeploymentRequestObject) (openapi.GetLatestDeploymentResponseObject, error) {
	out, err := h.svc.Latest(ctx, uuid.UUID(req.ProjectId))
	if err != nil {
		return nil, err
	}
	if out == nil {
		return openapi.GetLatestDeployment200JSONResponse{}, nil
	}
	return openapi.GetLatestDeployment200JSONResponse(*out), nil
}

func (h *Handler) CreateDeployment(ctx context.Context, req openapi.CreateDeploymentRequestObject) (openapi.CreateDeploymentResponseObject, error) {
	d, err := h.svc.Create(ctx, uuid.UUID(req.ProjectId))
	if err != nil {
		return nil, err
	}
	return openapi.CreateDeployment201JSONResponse(d), nil
}
