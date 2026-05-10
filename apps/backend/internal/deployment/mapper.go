package deployment

import (
	"encoding/json"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
)

// toWire renders a sqlc.Deployment to the wire shape. `envSlug` is resolved
// at the call site (one DB lookup) — could batch later if N+1 hurts.
func toWire(d sqlc.Deployment, envSlug string) openapi.Deployment {
	var snap any = map[string]any{}
	if len(d.Snapshot) > 0 {
		_ = json.Unmarshal(d.Snapshot, &snap)
	}
	out := openapi.Deployment{
		Id:          openapi_types.UUID(uuid.UUID(d.ID.Bytes)),
		ProjectId:   openapi_types.UUID(uuid.UUID(d.ProjectID.Bytes)),
		Environment: envSlug,
		Status:      openapi.DeploymentStatus(d.Status),
		Error:       d.Error,
		CreatedAt:   d.Created.Time,
		Snapshot:    snap,
	}
	if d.Applied.Valid {
		t := d.Applied.Time
		out.AppliedAt = &t
	}
	return out
}
