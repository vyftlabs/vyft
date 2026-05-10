// Package environment owns business logic for the environments entity.
package environment

import (
	"context"
	"errors"
	"regexp"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgerr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
)

var slugRe = regexp.MustCompile(`^[a-z][a-z0-9-]{0,30}$`)

type Service struct{ db *db.DB }

func New(d *db.DB) *Service { return &Service{db: d} }

func (s *Service) Get(ctx context.Context, id uuid.UUID) (sqlc.Environment, error) {
	row, err := s.db.Q.GetEnvironment(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Environment{}, apierr.NotFound("environment not found")
		}
		return sqlc.Environment{}, apierr.Internal(err)
	}
	return row, nil
}

func (s *Service) GetBySlug(ctx context.Context, projectID uuid.UUID, slug string) (sqlc.Environment, error) {
	row, err := s.db.Q.GetEnvironmentBySlug(ctx, sqlc.GetEnvironmentBySlugParams{
		ProjectID: pgxid.PgUUID(projectID),
		Slug:      slug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Environment{}, apierr.NotFound("environment not found")
		}
		return sqlc.Environment{}, apierr.Internal(err)
	}
	return row, nil
}

// DefaultID resolves the production env id for a project. Used by every
// v1 caller that doesn't take an explicit env (variables, routes, embedded
// resource creates).
func (s *Service) DefaultID(ctx context.Context, projectID uuid.UUID) (uuid.UUID, error) {
	row, err := s.GetBySlug(ctx, projectID, DefaultSlug)
	if err != nil {
		return uuid.Nil, err
	}
	return uuid.UUID(row.ID.Bytes), nil
}

func (s *Service) List(ctx context.Context, projectID uuid.UUID) ([]sqlc.Environment, error) {
	rows, err := s.db.Q.ListEnvironmentsByProject(ctx, pgxid.PgUUID(projectID))
	if err != nil {
		return nil, apierr.Internal(err)
	}
	return rows, nil
}

func (s *Service) Create(ctx context.Context, projectID uuid.UUID, slug string) (sqlc.Environment, error) {
	if !slugRe.MatchString(slug) {
		return sqlc.Environment{}, apierr.BadRequest("slug must match ^[a-z][a-z0-9-]{0,30}$")
	}
	row, err := s.db.Q.CreateEnvironment(ctx, sqlc.CreateEnvironmentParams{
		ID:        pgxid.PgUUID(uuid.New()),
		ProjectID: pgxid.PgUUID(projectID),
		Slug:      slug,
	})
	if err != nil {
		if pgerr.IsUniqueViolation(err) {
			return sqlc.Environment{}, apierr.Conflict("environment slug already exists in project")
		}
		if pgerr.IsForeignKeyViolation(err) {
			return sqlc.Environment{}, apierr.NotFound("project not found")
		}
		return sqlc.Environment{}, apierr.Internal(err)
	}
	return row, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	row, err := s.db.Q.GetEnvironment(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.NotFound("environment not found")
		}
		return apierr.Internal(err)
	}
	if row.Slug == DefaultSlug {
		return apierr.Conflict("cannot delete the default '" + DefaultSlug + "' environment")
	}
	if err := s.db.Q.DeleteEnvironment(ctx, pgxid.PgUUID(id)); err != nil {
		return apierr.Internal(err)
	}
	return nil
}

// CreateInTx is the transactional bootstrap helper called by project.Create
// to insert the default 'production' env in the same tx as the project row.
func CreateInTx(ctx context.Context, q *sqlc.Queries, projectID uuid.UUID, slug string) (sqlc.Environment, error) {
	return q.CreateEnvironment(ctx, sqlc.CreateEnvironmentParams{
		ID:        pgxid.PgUUID(uuid.New()),
		ProjectID: pgxid.PgUUID(projectID),
		Slug:      slug,
	})
}
