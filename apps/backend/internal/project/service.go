// Package project owns business logic for the projects entity.
package project

import (
	"context"
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

// ClusterCleanupFn deletes any cluster-side resources tied to a project
// (e.g. namespaces). Best-effort: errors are logged at the call site and
// don't block project deletion. nil = no-op (dev mode without cluster).
type ClusterCleanupFn func(ctx context.Context, slug string)

type Service struct {
	db             *db.DB
	clusterCleanup ClusterCleanupFn
}

func New(d *db.DB) *Service { return &Service{db: d} }

// WithClusterCleanup returns a copy of the service with the cluster cleanup
// hook attached. Called at server-wire time once we know whether a real k8s
// runtime is available.
func (s *Service) WithClusterCleanup(fn ClusterCleanupFn) *Service {
	cp := *s
	cp.clusterCleanup = fn
	return &cp
}

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
	projectID := uuid.New()
	var p sqlc.Project
	err := s.db.WithTx(ctx, func(q *sqlc.Queries) error {
		row, txErr := q.CreateProject(ctx, sqlc.CreateProjectParams{
			ID:          pgxid.PgUUID(projectID),
			Slug:        body.Slug,
			Name:        body.Name,
			Description: body.Description,
		})
		if txErr != nil {
			return txErr
		}
		p = row
		// Bootstrap the default environment in the same tx; every project
		// always has at least one env from creation.
		_, txErr = environment.CreateInTx(ctx, q, projectID, environment.DefaultSlug)
		return txErr
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
	// Capture slug BEFORE deleting the row so we can label-select the
	// project's namespaces afterwards.
	row, err := s.db.Q.GetProject(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.NotFound("project not found")
		}
		return apierr.Internal(err)
	}
	if err := s.db.Q.DeleteProject(ctx, pgxid.PgUUID(id)); err != nil {
		return apierr.Internal(err)
	}
	if s.clusterCleanup != nil {
		// Best-effort. Goroutine so a slow cluster doesn't block the response;
		// orphan namespaces are picked up by a future boot-time sweep (out of
		// scope per plan).
		go s.clusterCleanup(context.Background(), row.Slug)
	}
	return nil
}
