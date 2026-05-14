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

// ClusterSyncFn fans the registry secret out to every existing project
// namespace. Best-effort: errors logged at the call site; the next deploy
// will reconcile.
type ClusterSyncFn func(ctx context.Context, registry sqlc.Registry)

// ClusterDeleteFn deletes the registry secret from every project namespace.
type ClusterDeleteFn func(ctx context.Context, registryName string)

type Service struct {
	db            *db.DB
	clusterSync   ClusterSyncFn
	clusterDelete ClusterDeleteFn
}

func New(d *db.DB) *Service { return &Service{db: d} }

// WithClusterHooks attaches sync/delete callbacks. Called at server-wire
// time once we know whether a real k8s runtime is available.
func (s *Service) WithClusterHooks(sync ClusterSyncFn, del ClusterDeleteFn) *Service {
	cp := *s
	cp.clusterSync = sync
	cp.clusterDelete = del
	return &cp
}

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
	if s.clusterSync != nil {
		s.clusterSync(ctx, row)
	}
	return row, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	row, err := s.db.Q.GetRegistry(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.NotFound("registry not found")
		}
		return apierr.Internal(err)
	}
	if err := s.db.Q.DeleteRegistry(ctx, pgxid.PgUUID(id)); err != nil {
		return apierr.Internal(err)
	}
	if s.clusterDelete != nil {
		s.clusterDelete(ctx, row.Name)
	}
	return nil
}
