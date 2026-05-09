// Package registry owns business logic for image-pull registries.
package registry

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

func (s *Service) List(ctx context.Context) ([]sqlc.Registry, error) {
	rows, err := s.db.Q.ListRegistries(ctx)
	if err != nil {
		return nil, apierr.Internal(err)
	}
	return rows, nil
}

func (s *Service) Create(ctx context.Context, body openapi.RegistryCreate) (sqlc.Registry, error) {
	if body.Name == "" || body.Url == "" || body.Username == "" || body.Password == "" {
		return sqlc.Registry{}, apierr.BadRequest("name, url, username, password required")
	}
	row, err := s.db.Q.CreateRegistry(ctx, sqlc.CreateRegistryParams{
		ID:                pgxid.PgUUID(uuid.New()),
		Name:              body.Name,
		Url:               body.Url,
		Username:          body.Username,
		PasswordEncrypted: []byte(body.Password), // TODO: encrypt
	})
	if err != nil {
		if pgerr.IsUniqueViolation(err) {
			return sqlc.Registry{}, apierr.Conflict("registry name already exists")
		}
		return sqlc.Registry{}, apierr.Internal(err)
	}
	return row, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	if _, err := s.db.Q.GetRegistry(ctx, pgxid.PgUUID(id)); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.NotFound("registry not found")
		}
		return apierr.Internal(err)
	}
	if err := s.db.Q.DeleteRegistry(ctx, pgxid.PgUUID(id)); err != nil {
		return apierr.Internal(err)
	}
	return nil
}
