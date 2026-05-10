package deployment

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	uuid "github.com/google/uuid"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
)

type Handler struct{ svc *Service }

func NewHandler(s *Service) *Handler { return &Handler{svc: s} }

func (h *Handler) ListDeployments(ctx context.Context, req openapi.ListDeploymentsRequestObject) (openapi.ListDeploymentsResponseObject, error) {
	limit := int32(50)
	offset := int32(0)
	if req.Params.Limit != nil {
		limit = int32(*req.Params.Limit)
	}
	if req.Params.Offset != nil {
		offset = int32(*req.Params.Offset)
	}
	rows, err := h.svc.List(ctx, uuid.UUID(req.ProjectId), req.Params.Environment, limit, offset)
	if err != nil {
		return nil, err
	}
	out := make([]openapi.Deployment, 0, len(rows))
	for _, d := range rows {
		envSlug, _ := h.envSlug(ctx, d.EnvironmentID)
		out = append(out, toWire(d, envSlug))
	}
	return openapi.ListDeployments200JSONResponse(out), nil
}

func (h *Handler) CreateDeployment(ctx context.Context, req openapi.CreateDeploymentRequestObject) (openapi.CreateDeploymentResponseObject, error) {
	var slug *string
	if req.Body != nil && req.Body.Environment != nil {
		s := *req.Body.Environment
		slug = &s
	}
	d, err := h.svc.Create(ctx, uuid.UUID(req.ProjectId), slug)
	if err != nil {
		return nil, err
	}
	envSlug, _ := h.envSlug(ctx, d.EnvironmentID)
	return openapi.CreateDeployment202JSONResponse(toWire(d, envSlug)), nil
}

func (h *Handler) GetDeployment(ctx context.Context, req openapi.GetDeploymentRequestObject) (openapi.GetDeploymentResponseObject, error) {
	d, err := h.svc.Get(ctx, uuid.UUID(req.Id))
	if err != nil {
		return nil, err
	}
	envSlug, _ := h.envSlug(ctx, d.EnvironmentID)
	return openapi.GetDeployment200JSONResponse(toWire(d, envSlug)), nil
}

// envSlug looks up the environment slug for a deployment row. Returns ""
// on error so wire output is still well-formed; the row is the source of
// truth for the env id, slug is a frontend convenience.
func (h *Handler) envSlug(ctx context.Context, envID pgtype.UUID) (string, error) {
	row, err := h.svc.db.Q.GetEnvironment(ctx, envID)
	if err != nil {
		return "", apierr.Internal(err)
	}
	return row.Slug, nil
}
