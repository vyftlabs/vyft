package route

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
)

type Handler struct{ svc *Service }

func NewHandler(s *Service) *Handler { return &Handler{svc: s} }

func toWire(r sqlc.Route) openapi.Route {
	out := openapi.Route{
		Id:         openapi_types.UUID(uuid.UUID(r.ID.Bytes)),
		ResourceId: openapi_types.UUID(uuid.UUID(r.ResourceID.Bytes)),
		Domain:     r.Domain,
		Path:       r.Path,
		PathType:   openapi.PathType(r.PathType),
		Port:       int(r.Port),
		Tls:        r.Tls,
		CreatedAt:  r.Created.Time,
		UpdatedAt:  r.Updated.Time,
	}
	if len(r.Config) > 0 && string(r.Config) != "{}" {
		var cfg openapi.RouteConfigOutput
		if err := json.Unmarshal(r.Config, &cfg); err == nil {
			out.Config = &cfg
		}
	}
	return out
}

func (h *Handler) ListRoutes(ctx context.Context, req openapi.ListRoutesRequestObject) (openapi.ListRoutesResponseObject, error) {
	rows, err := h.svc.ListByProject(ctx, uuid.UUID(req.ProjectId))
	if err != nil {
		return nil, err
	}
	out := make([]openapi.Route, len(rows))
	for i, r := range rows {
		out[i] = toWire(r)
	}
	return openapi.ListRoutes200JSONResponse(out), nil
}

func (h *Handler) GetRoute(ctx context.Context, req openapi.GetRouteRequestObject) (openapi.GetRouteResponseObject, error) {
	row, err := h.svc.Get(ctx, uuid.UUID(req.Id))
	if err != nil {
		return nil, err
	}
	return openapi.GetRoute200JSONResponse(toWire(row)), nil
}

func (h *Handler) CreateRoute(ctx context.Context, req openapi.CreateRouteRequestObject) (openapi.CreateRouteResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	row, err := h.svc.Create(ctx, uuid.UUID(req.ProjectId), *req.Body)
	if err != nil {
		return nil, err
	}
	return openapi.CreateRoute201JSONResponse(toWire(row)), nil
}

func (h *Handler) UpdateRoute(ctx context.Context, req openapi.UpdateRouteRequestObject) (openapi.UpdateRouteResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	row, err := h.svc.Update(ctx, uuid.UUID(req.Id), *req.Body)
	if err != nil {
		return nil, err
	}
	return openapi.UpdateRoute200JSONResponse(toWire(row)), nil
}

func (h *Handler) DeleteRoute(ctx context.Context, req openapi.DeleteRouteRequestObject) (openapi.DeleteRouteResponseObject, error) {
	if err := h.svc.Delete(ctx, uuid.UUID(req.Id)); err != nil {
		return nil, err
	}
	return openapi.DeleteRoute204Response{}, nil
}
