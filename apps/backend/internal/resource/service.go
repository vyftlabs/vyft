// Package resource owns business logic for the resources entity.
//
// On the DB side `resources.spec` JSONB stores the kind-specific spec MINUS
// routes (routes live in their own table). On the wire, AppSpec.routes is
// composed back in by joining the routes table.
package resource

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/environment"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgerr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
)

// ResourceWithRoutes is the documented exception to "service returns sqlc
// rows": resource handlers need both the resource row and its joined routes
// to build the wire envelope.
type ResourceWithRoutes struct {
	R      sqlc.Resource
	Routes []sqlc.Route
}

type Service struct {
	db  *db.DB
	env *environment.Service
}

func New(d *db.DB, env *environment.Service) *Service { return &Service{db: d, env: env} }

func (s *Service) ListByProject(ctx context.Context, projectID uuid.UUID) ([]ResourceWithRoutes, error) {
	envID, err := s.env.DefaultID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.Q.ListResourcesByProject(ctx, pgxid.PgUUID(projectID))
	if err != nil {
		return nil, apierr.Internal(err)
	}
	out := make([]ResourceWithRoutes, 0, len(rows))
	for _, r := range rows {
		routes, err := s.db.Q.ListRoutesByResourceEnv(ctx, sqlc.ListRoutesByResourceEnvParams{
			ResourceID:    r.ID,
			EnvironmentID: pgxid.PgUUID(envID),
		})
		if err != nil {
			return nil, apierr.Internal(err)
		}
		out = append(out, ResourceWithRoutes{R: r, Routes: routes})
	}
	return out, nil
}

func (s *Service) Get(ctx context.Context, id uuid.UUID) (ResourceWithRoutes, error) {
	row, err := s.db.Q.GetResource(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ResourceWithRoutes{}, apierr.NotFound("resource not found")
		}
		return ResourceWithRoutes{}, apierr.Internal(err)
	}
	envID, err := s.env.DefaultID(ctx, uuid.UUID(row.ProjectID.Bytes))
	if err != nil {
		return ResourceWithRoutes{}, err
	}
	routes, err := s.db.Q.ListRoutesByResourceEnv(ctx, sqlc.ListRoutesByResourceEnvParams{
		ResourceID:    row.ID,
		EnvironmentID: pgxid.PgUUID(envID),
	})
	if err != nil {
		return ResourceWithRoutes{}, apierr.Internal(err)
	}
	return ResourceWithRoutes{R: row, Routes: routes}, nil
}

func (s *Service) Create(ctx context.Context, projectID uuid.UUID, body openapi.ResourceCreate) (ResourceWithRoutes, error) {
	if body.Name == "" {
		return ResourceWithRoutes{}, apierr.BadRequest("name required")
	}

	configRaw, err := json.Marshal(body.Config)
	if err != nil {
		return ResourceWithRoutes{}, apierr.BadRequest("invalid config")
	}
	var configEnvelope struct {
		Kind string          `json:"kind"`
		Spec json.RawMessage `json:"spec"`
	}
	if err := json.Unmarshal(configRaw, &configEnvelope); err != nil {
		return ResourceWithRoutes{}, apierr.BadRequest("invalid config: " + err.Error())
	}
	if configEnvelope.Kind == "" {
		return ResourceWithRoutes{}, apierr.BadRequest("config.kind required")
	}
	rawRoutes, cleanSpec, err := extractRoutes(configEnvelope.Spec)
	if err != nil {
		return ResourceWithRoutes{}, apierr.BadRequest("invalid spec: " + err.Error())
	}

	envID, err := s.env.DefaultID(ctx, projectID)
	if err != nil {
		return ResourceWithRoutes{}, err
	}

	resourceID := uuid.New()
	var row sqlc.Resource
	err = s.db.WithTx(ctx, func(q *sqlc.Queries) error {
		var txErr error
		row, txErr = q.CreateResource(ctx, sqlc.CreateResourceParams{
			ID:        pgxid.PgUUID(resourceID),
			ProjectID: pgxid.PgUUID(projectID),
			Name:      body.Name,
			Kind:      configEnvelope.Kind,
			PositionX: float64(body.PositionX),
			PositionY: float64(body.PositionY),
			Spec:      cleanSpec,
		})
		if txErr != nil {
			return txErr
		}
		for _, rawRoute := range rawRoutes {
			if err := persistEmbeddedRoute(ctx, q, projectID, envID, resourceID, rawRoute); err != nil {
				return err
			}
		}
		if body.Variables != nil {
			for _, v := range *body.Variables {
				if err := persistEmbeddedVariable(ctx, q, projectID, envID, resourceID, v); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		if pgerr.IsUniqueViolation(err) {
			return ResourceWithRoutes{}, apierr.Conflict("resource name already exists in project")
		}
		return ResourceWithRoutes{}, apierr.Internal(err)
	}

	envIDCreate, err := s.env.DefaultID(ctx, uuid.UUID(row.ProjectID.Bytes))
	if err != nil {
		return ResourceWithRoutes{}, err
	}
	routes, err := s.db.Q.ListRoutesByResourceEnv(ctx, sqlc.ListRoutesByResourceEnvParams{
		ResourceID:    row.ID,
		EnvironmentID: pgxid.PgUUID(envIDCreate),
	})
	if err != nil {
		return ResourceWithRoutes{}, apierr.Internal(err)
	}
	return ResourceWithRoutes{R: row, Routes: routes}, nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, body openapi.ResourceUpdate) (ResourceWithRoutes, error) {
	current, err := s.db.Q.GetResource(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ResourceWithRoutes{}, apierr.NotFound("resource not found")
		}
		return ResourceWithRoutes{}, apierr.Internal(err)
	}

	if body.Name != nil && *body.Name != current.Name {
		return ResourceWithRoutes{}, apierr.Conflict("resource name is immutable")
	}
	name := current.Name
	kind := current.Kind
	specBytes := current.Spec
	if body.Config != nil {
		raw, err := json.Marshal(body.Config)
		if err != nil {
			return ResourceWithRoutes{}, apierr.BadRequest("invalid config")
		}
		var envelope struct {
			Kind string          `json:"kind"`
			Spec json.RawMessage `json:"spec"`
		}
		if err := json.Unmarshal(raw, &envelope); err != nil {
			return ResourceWithRoutes{}, apierr.BadRequest("invalid config")
		}
		if envelope.Kind != "" {
			kind = envelope.Kind
		}
		if len(envelope.Spec) > 0 && string(envelope.Spec) != "null" {
			_, clean, err := extractRoutes(envelope.Spec)
			if err != nil {
				return ResourceWithRoutes{}, apierr.BadRequest("invalid spec: " + err.Error())
			}
			specBytes = clean
		}
	}

	row, err := s.db.Q.UpdateResource(ctx, sqlc.UpdateResourceParams{
		ID:   pgxid.PgUUID(id),
		Name: name,
		Kind: kind,
		Spec: specBytes,
	})
	if err != nil {
		return ResourceWithRoutes{}, apierr.Internal(err)
	}

	if body.PositionX != nil || body.PositionY != nil {
		px := current.PositionX
		py := current.PositionY
		if body.PositionX != nil {
			px = float64(*body.PositionX)
		}
		if body.PositionY != nil {
			py = float64(*body.PositionY)
		}
		if err := s.db.Q.UpdateResourcePosition(ctx, sqlc.UpdateResourcePositionParams{
			ID:        pgxid.PgUUID(id),
			PositionX: px,
			PositionY: py,
		}); err != nil {
			return ResourceWithRoutes{}, apierr.Internal(err)
		}
		row, _ = s.db.Q.GetResource(ctx, pgxid.PgUUID(id))
	}

	envID, err := s.env.DefaultID(ctx, uuid.UUID(row.ProjectID.Bytes))
	if err != nil {
		return ResourceWithRoutes{}, err
	}
	routes, err := s.db.Q.ListRoutesByResourceEnv(ctx, sqlc.ListRoutesByResourceEnvParams{
		ResourceID:    row.ID,
		EnvironmentID: pgxid.PgUUID(envID),
	})
	if err != nil {
		return ResourceWithRoutes{}, apierr.Internal(err)
	}
	return ResourceWithRoutes{R: row, Routes: routes}, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	if err := s.db.Q.DeleteResource(ctx, pgxid.PgUUID(id)); err != nil {
		return apierr.Internal(err)
	}
	return nil
}
