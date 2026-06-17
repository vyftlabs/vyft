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
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"

	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/environment"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/pgbackup"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgerr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
	"github.com/vyftlabs/vyft/apps/backend/internal/runtime/k8s"
	"github.com/vyftlabs/vyft/apps/backend/internal/status"
)

// deriveSlug returns "<sanitized name>-<6 hex of id>". Slug is DNS-1123 safe
// (lowercase a-z, 0-9, hyphens), stable across renames, unique per project.
// Used for k8s object names + label selectors + observability queries.
var slugUnsafe = regexp.MustCompile(`[^a-z0-9]+`)

func deriveSlug(name string, id uuid.UUID) string {
	base := slugUnsafe.ReplaceAllString(strings.ToLower(name), "-")
	base = strings.Trim(base, "-")
	if base == "" {
		base = "r"
	}
	return base + "-" + strings.ReplaceAll(id.String(), "-", "")[:6]
}

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
	// cs is the cluster client used for best-effort live status reads. May
	// be nil in tests / when no cluster is configured — status is then omitted.
	cs kubernetes.Interface
	// dyn reads CR-backed kinds (CNPG Cluster for postgres). May be nil.
	dyn dynamic.Interface
}

func New(d *db.DB, env *environment.Service, cs kubernetes.Interface, dyn dynamic.Interface) *Service {
	return &Service{db: d, env: env, cs: cs, dyn: dyn}
}

// StatusesByProject returns the live health of each resource in a project,
// keyed by slug. Best-effort — a cluster error or nil client yields nil, and
// the caller leaves those resources without a status (rendered "unknown").
func (s *Service) StatusesByProject(ctx context.Context, projectID uuid.UUID) map[string]status.Status {
	proj, err := s.db.Q.GetProject(ctx, pgxid.PgUUID(projectID))
	if err != nil {
		return nil
	}
	return status.ProjectStatuses(ctx, s.cs, s.dyn, proj.Slug, environment.DefaultSlug)
}

// nsAndSlug resolves a resource to its cluster namespace, its slug, and its
// project slug.
func (s *Service) nsAndSlug(ctx context.Context, resourceID uuid.UUID) (ns, slug, projSlug string, err error) {
	row, err := s.db.Q.GetResource(ctx, pgxid.PgUUID(resourceID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", "", apierr.NotFound("resource not found")
		}
		return "", "", "", apierr.Internal(err)
	}
	proj, err := s.db.Q.GetProject(ctx, row.ProjectID)
	if err != nil {
		return "", "", "", apierr.Internal(err)
	}
	return k8s.NamespaceFor(proj.Slug, environment.DefaultSlug), row.Slug, proj.Slug, nil
}

// ListBackups returns the resource's CNPG backups (newest first). Best-effort —
// a missing CRD or read error yields an empty list rather than an error.
func (s *Service) ListBackups(ctx context.Context, resourceID uuid.UUID) ([]pgbackup.Backup, error) {
	ns, slug, _, err := s.nsAndSlug(ctx, resourceID)
	if err != nil {
		return nil, err
	}
	bks, err := pgbackup.List(ctx, s.dyn, ns, slug)
	if err != nil {
		return []pgbackup.Backup{}, nil
	}
	return bks, nil
}

// CreateBackup triggers an on-demand backup for the resource.
func (s *Service) CreateBackup(ctx context.Context, resourceID uuid.UUID) (pgbackup.Backup, error) {
	ns, slug, projSlug, err := s.nsAndSlug(ctx, resourceID)
	if err != nil {
		return pgbackup.Backup{}, err
	}
	name := slug + "-manual-" + time.Now().UTC().Format("20060102150405")
	labels := map[string]string{k8s.LabelProject: projSlug, k8s.LabelResource: slug}
	b, err := pgbackup.Create(ctx, s.dyn, ns, slug, name, labels)
	if err != nil {
		return pgbackup.Backup{}, apierr.ServiceUnavailable(err.Error())
	}
	return b, nil
}

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
	slug := deriveSlug(body.Name, resourceID)
	var row sqlc.Resource
	err = s.db.WithTx(ctx, func(q *sqlc.Queries) error {
		var txErr error
		row, txErr = q.CreateResource(ctx, sqlc.CreateResourceParams{
			ID:        pgxid.PgUUID(resourceID),
			ProjectID: pgxid.PgUUID(projectID),
			Name:      body.Name,
			Slug:      slug,
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
		// Postgres exposes its connection as importable secret-ref variables.
		if configEnvelope.Kind == "postgres" {
			if err := seedPostgresConnVars(ctx, q, projectID, envID, resourceID, slug); err != nil {
				return err
			}
		}
		// Redis: generated-password connection vars (HOST/PORT/PASSWORD/URL).
		if configEnvelope.Kind == "redis" {
			if err := seedRedisConnVars(ctx, q, projectID, envID, resourceID, slug); err != nil {
				return err
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
