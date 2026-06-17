package resource

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/pgbackup"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/status"
)

type Handler struct{ svc *Service }

func NewHandler(s *Service) *Handler { return &Handler{svc: s} }

// ListResourceBackups returns a postgres resource's CNPG backups, newest first.
func (h *Handler) ListResourceBackups(ctx context.Context, req openapi.ListResourceBackupsRequestObject) (openapi.ListResourceBackupsResponseObject, error) {
	bks, err := h.svc.ListBackups(ctx, uuid.UUID(req.ResourceId))
	if err != nil {
		return nil, err
	}
	out := make([]openapi.Backup, 0, len(bks))
	for _, b := range bks {
		out = append(out, toWireBackup(b))
	}
	return openapi.ListResourceBackups200JSONResponse(out), nil
}

// CreateResourceBackup triggers an on-demand backup.
func (h *Handler) CreateResourceBackup(ctx context.Context, req openapi.CreateResourceBackupRequestObject) (openapi.CreateResourceBackupResponseObject, error) {
	b, err := h.svc.CreateBackup(ctx, uuid.UUID(req.ResourceId))
	if err != nil {
		return nil, err
	}
	return openapi.CreateResourceBackup202JSONResponse(toWireBackup(b)), nil
}

// toWireBackup maps a normalized backup to the wire shape (by value, so the
// optional-field pointers are unique per call).
func toWireBackup(b pgbackup.Backup) openapi.Backup {
	w := openapi.Backup{
		Name:      b.Name,
		Phase:     b.Phase,
		StartedAt: b.StartedAt,
		StoppedAt: b.StoppedAt,
	}
	if b.BackupID != "" {
		w.BackupId = &b.BackupID
	}
	if b.Method != "" {
		w.Method = &b.Method
	}
	if b.Error != "" {
		w.Error = &b.Error
	}
	return w
}

// toWireStatus maps the internal status to the optional wire ServiceStatus.
// Message is omitted when empty (running/stopped carry no message).
func toWireStatus(st status.Status) *openapi.ServiceStatus {
	w := &openapi.ServiceStatus{State: openapi.ServiceState(st.State)}
	if st.Message != "" {
		w.Message = &st.Message
	}
	return w
}

// resourceToWire composes a Resource wire object from a row + joined routes.
// Resource is the documented exception to inline mapping (~60 LOC, 4 callers).
func resourceToWire(rwr ResourceWithRoutes) (openapi.Resource, error) {
	r := rwr.R
	var spec map[string]any
	if len(r.Spec) > 0 {
		_ = json.Unmarshal(r.Spec, &spec)
	}
	if spec == nil {
		spec = map[string]any{}
	}

	if len(rwr.Routes) > 0 {
		wireRoutes := make([]map[string]any, 0, len(rwr.Routes))
		for _, rt := range rwr.Routes {
			entry := map[string]any{
				"id":         uuid.UUID(rt.ID.Bytes).String(),
				"resourceId": uuid.UUID(rt.ResourceID.Bytes).String(),
				"domain":     rt.Domain,
				"path":       rt.Path,
				"pathType":   string(rt.PathType),
				"port":       rt.Port,
				"tls":        rt.Tls,
				"createdAt":  rt.Created.Time,
				"updatedAt":  rt.Updated.Time,
			}
			if len(rt.Config) > 0 && string(rt.Config) != "{}" {
				var cfg any
				if err := json.Unmarshal(rt.Config, &cfg); err == nil {
					entry["config"] = cfg
				}
			}
			wireRoutes = append(wireRoutes, entry)
		}
		spec["routes"] = wireRoutes
	}

	envelope := map[string]any{"kind": r.Kind, "spec": spec}
	envelopeBytes, err := json.Marshal(envelope)
	if err != nil {
		return openapi.Resource{}, apierr.Internal(err)
	}
	var cfg openapi.ResourceConfig
	if err := json.Unmarshal(envelopeBytes, &cfg); err != nil {
		return openapi.Resource{}, apierr.Internal(err)
	}

	return openapi.Resource{
		Id:        openapi_types.UUID(uuid.UUID(r.ID.Bytes)),
		ProjectId: openapi_types.UUID(uuid.UUID(r.ProjectID.Bytes)),
		Name:      r.Name,
		Slug:      r.Slug,
		PositionX: float32(r.PositionX),
		PositionY: float32(r.PositionY),
		Config:    cfg,
		CreatedAt: r.Created.Time,
		UpdatedAt: r.Updated.Time,
	}, nil
}

func (h *Handler) ListResources(ctx context.Context, req openapi.ListResourcesRequestObject) (openapi.ListResourcesResponseObject, error) {
	rows, err := h.svc.ListByProject(ctx, uuid.UUID(req.ProjectId))
	if err != nil {
		return nil, err
	}
	// Best-effort live health, folded in by slug. A cluster error yields an
	// empty map — resources stay status-less and render as "unknown".
	statuses := h.svc.StatusesByProject(ctx, uuid.UUID(req.ProjectId))
	out := make([]openapi.Resource, 0, len(rows))
	for _, r := range rows {
		w, err := resourceToWire(r)
		if err != nil {
			return nil, err
		}
		if st, ok := statuses[w.Slug]; ok {
			w.Status = toWireStatus(st)
		}
		out = append(out, w)
	}
	return openapi.ListResources200JSONResponse(out), nil
}

func (h *Handler) GetResource(ctx context.Context, req openapi.GetResourceRequestObject) (openapi.GetResourceResponseObject, error) {
	rwr, err := h.svc.Get(ctx, uuid.UUID(req.Id))
	if err != nil {
		return nil, err
	}
	w, err := resourceToWire(rwr)
	if err != nil {
		return nil, err
	}
	return openapi.GetResource200JSONResponse(w), nil
}

func (h *Handler) CreateResource(ctx context.Context, req openapi.CreateResourceRequestObject) (openapi.CreateResourceResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	rwr, err := h.svc.Create(ctx, uuid.UUID(req.ProjectId), *req.Body)
	if err != nil {
		return nil, err
	}
	w, err := resourceToWire(rwr)
	if err != nil {
		return nil, err
	}
	return openapi.CreateResource201JSONResponse(w), nil
}

func (h *Handler) UpdateResource(ctx context.Context, req openapi.UpdateResourceRequestObject) (openapi.UpdateResourceResponseObject, error) {
	if req.Body == nil {
		return nil, apierr.BadRequest("body required")
	}
	rwr, err := h.svc.Update(ctx, uuid.UUID(req.Id), *req.Body)
	if err != nil {
		return nil, err
	}
	w, err := resourceToWire(rwr)
	if err != nil {
		return nil, err
	}
	return openapi.UpdateResource200JSONResponse(w), nil
}

func (h *Handler) DeleteResource(ctx context.Context, req openapi.DeleteResourceRequestObject) (openapi.DeleteResourceResponseObject, error) {
	if err := h.svc.Delete(ctx, uuid.UUID(req.Id)); err != nil {
		return nil, err
	}
	return openapi.DeleteResource204Response{}, nil
}
