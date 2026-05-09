// Package project owns business logic for the projects entity.
package project

import (
	"context"
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

func (s *Service) List(ctx context.Context) ([]sqlc.Project, error) {
	rows, err := s.db.Q.ListProjects(ctx)
	if err != nil {
		return nil, apierr.Internal(err)
	}
	return rows, nil
}

func (s *Service) Get(ctx context.Context, id uuid.UUID) (sqlc.Project, error) {
	p, err := s.db.Q.GetProject(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Project{}, apierr.NotFound("project not found")
		}
		return sqlc.Project{}, apierr.Internal(err)
	}
	return p, nil
}

func (s *Service) Create(ctx context.Context, body openapi.ProjectCreate) (sqlc.Project, error) {
	if body.Name == "" || body.Slug == "" {
		return sqlc.Project{}, apierr.BadRequest("name and slug are required")
	}
	p, err := s.db.Q.CreateProject(ctx, sqlc.CreateProjectParams{
		ID:          pgxid.PgUUID(uuid.New()),
		Slug:        body.Slug,
		Name:        body.Name,
		Description: body.Description,
	})
	if err != nil {
		if pgerr.IsUniqueViolation(err) {
			return sqlc.Project{}, apierr.Conflict("project with this slug already exists")
		}
		return sqlc.Project{}, apierr.Internal(err)
	}
	return p, nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, body openapi.ProjectUpdate) (sqlc.Project, error) {
	current, err := s.db.Q.GetProject(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Project{}, apierr.NotFound("project not found")
		}
		return sqlc.Project{}, apierr.Internal(err)
	}
	name := current.Name
	if body.Name != nil {
		name = *body.Name
	}
	desc := current.Description
	if body.Description != nil {
		desc = body.Description
	}
	updated, err := s.db.Q.UpdateProject(ctx, sqlc.UpdateProjectParams{
		ID:          pgxid.PgUUID(id),
		Slug:        current.Slug,
		Name:        name,
		Description: desc,
	})
	if err != nil {
		return sqlc.Project{}, apierr.Internal(err)
	}
	return updated, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	if err := s.db.Q.DeleteProject(ctx, pgxid.PgUUID(id)); err != nil {
		return apierr.Internal(err)
	}
	return nil
}
