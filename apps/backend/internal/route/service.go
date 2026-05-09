// Package route owns business logic for HTTP routes.
package route

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgerr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
)

type Service struct{ db *db.DB }

func New(d *db.DB) *Service { return &Service{db: d} }

func (s *Service) ListByProject(ctx context.Context, projectID uuid.UUID) ([]sqlc.Route, error) {
	rows, err := s.db.Q.ListRoutesByProject(ctx, pgxid.PgUUID(projectID))
	if err != nil {
		return nil, apierr.Internal(err)
	}
	return rows, nil
}

func (s *Service) Get(ctx context.Context, id uuid.UUID) (sqlc.Route, error) {
	row, err := s.db.Q.GetRoute(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Route{}, apierr.NotFound("route not found")
		}
		return sqlc.Route{}, apierr.Internal(err)
	}
	return row, nil
}

func (s *Service) Create(ctx context.Context, projectID uuid.UUID, body openapi.RouteCreate) (sqlc.Route, error) {
	pathType := sqlc.RoutePathType(body.PathType)
	if pathType == "" {
		pathType = sqlc.RoutePathTypePrefix
	}
	cfg := json.RawMessage("{}")
	if body.Config != nil {
		raw, err := json.Marshal(body.Config)
		if err != nil {
			return sqlc.Route{}, apierr.BadRequest("invalid config: " + err.Error())
		}
		cfg = raw
	}

	row, err := s.db.Q.CreateRoute(ctx, sqlc.CreateRouteParams{
		ID:         pgxid.PgUUID(uuid.New()),
		ProjectID:  pgxid.PgUUID(projectID),
		ResourceID: pgxid.PgUUID(uuid.UUID(body.ResourceId)),
		Domain:     body.Domain,
		Path:       body.Path,
		PathType:   pathType,
		Port:       int32(body.Port),
		Tls:        body.Tls,
		Config:     cfg,
	})
	if err != nil {
		if pgerr.IsUniqueViolation(err) {
			return sqlc.Route{}, apierr.Conflict("route (domain, path, pathType) already exists")
		}
		if pgerr.IsForeignKeyViolation(err) {
			return sqlc.Route{}, apierr.BadRequest("resource does not belong to project")
		}
		return sqlc.Route{}, apierr.Internal(err)
	}
	return row, nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, body openapi.RouteUpdate) (sqlc.Route, error) {
	current, err := s.db.Q.GetRoute(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Route{}, apierr.NotFound("route not found")
		}
		return sqlc.Route{}, apierr.Internal(err)
	}

	domain := current.Domain
	if body.Domain != nil {
		domain = *body.Domain
	}
	path := current.Path
	if body.Path != nil {
		path = *body.Path
	}
	pathType := current.PathType
	if body.PathType != nil {
		pathType = sqlc.RoutePathType(*body.PathType)
	}
	port := current.Port
	if body.Port != nil {
		port = int32(*body.Port)
	}
	tls := current.Tls
	if body.Tls != nil {
		tls = *body.Tls
	}
	cfg := current.Config
	if body.Config != nil {
		raw, err := json.Marshal(body.Config)
		if err != nil {
			return sqlc.Route{}, apierr.BadRequest("invalid config: " + err.Error())
		}
		cfg = raw
	}

	row, err := s.db.Q.UpdateRoute(ctx, sqlc.UpdateRouteParams{
		ID:       pgxid.PgUUID(id),
		Domain:   domain,
		Path:     path,
		PathType: pathType,
		Port:     port,
		Tls:      tls,
		Config:   cfg,
	})
	if err != nil {
		if pgerr.IsUniqueViolation(err) {
			return sqlc.Route{}, apierr.Conflict("route (domain, path, pathType) already exists")
		}
		return sqlc.Route{}, apierr.Internal(err)
	}
	return row, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	if err := s.db.Q.DeleteRoute(ctx, pgxid.PgUUID(id)); err != nil {
		return apierr.Internal(err)
	}
	return nil
}
