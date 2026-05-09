package deployment

import (
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
)

func toWire(d sqlc.Deployment) openapi.Deployment {
	out := openapi.Deployment{
		Id:            openapi_types.UUID(uuid.UUID(d.ID.Bytes)),
		ProjectId:     openapi_types.UUID(uuid.UUID(d.ProjectID.Bytes)),
		Checksum:      d.Checksum,
		Status:        openapi.DeploymentStatus(d.Status),
		StatusMessage: d.StatusMessage,
		CreatedAt:     d.Created.Time,
	}
	if d.Applied.Valid {
		t := d.Applied.Time
		out.AppliedAt = &t
	}
	return out
}
