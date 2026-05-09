package project

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

func toWire(p sqlc.Project) openapi.Project {
	return openapi.Project{
		Id:          openapi_types.UUID(uuid.UUID(p.ID.Bytes)),
		Slug:        p.Slug,
		Name:        p.Name,
		Description: p.Description,
		CreatedAt:   p.Created.Time,
		UpdatedAt:   p.Updated.Time,
	}
}

func (h *Handler) ListProjects(ctx context.Context, _ openapi.ListProjectsRequestObject) (openapi.ListProjectsResponseObject, error) {
	rows, err := h.svc.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]openapi.Project, len(rows))
	for i, p := range rows {
		out[i] = toWire(p)
	}
	return openapi.ListProjects200JSONResponse(out), nil
}

func (h *Handler) GetProject(ctx context.Context, req openapi.GetProjectRequestObject) (openapi.GetProjectResponseObject, error) {
	p, err := h.svc.Get(ctx, uuid.UUID(req.Id))
	if err != nil {
		return nil, err
	}
	return openapi.GetProject200JSONResponse(toWire(p)), nil
}

func (h *Handler) CreateProject(ctx context.Context, req openapi.CreateProjectRequestObject) (openapi.CreateProjectResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	p, err := h.svc.Create(ctx, *req.Body)
	if err != nil {
		return nil, err
	}
	return openapi.CreateProject201JSONResponse(toWire(p)), nil
}

func (h *Handler) UpdateProject(ctx context.Context, req openapi.UpdateProjectRequestObject) (openapi.UpdateProjectResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	p, err := h.svc.Update(ctx, uuid.UUID(req.Id), *req.Body)
	if err != nil {
		return nil, err
	}
	return openapi.UpdateProject200JSONResponse(toWire(p)), nil
}

func (h *Handler) DeleteProject(ctx context.Context, req openapi.DeleteProjectRequestObject) (openapi.DeleteProjectResponseObject, error) {
	if err := h.svc.Delete(ctx, uuid.UUID(req.Id)); err != nil {
		return nil, err
	}
	return openapi.DeleteProject204Response{}, nil
}
