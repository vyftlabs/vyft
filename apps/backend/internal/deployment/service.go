// Package deployment owns the deployment service: REST surface, async
// goroutine that calls Runtime.Apply, and boot recovery.
package deployment

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/environment"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgerr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
)

// applyTimeout bounds a single deployment goroutine. Long enough for typical
// k8s rollouts, short enough to surface stuck applies as `failed`.
const applyTimeout = 5 * time.Minute

type Service struct {
	db  *db.DB
	env *environment.Service
	rt  Runtime
}

func New(d *db.DB, env *environment.Service, rt Runtime) *Service {
	return &Service{db: d, env: env, rt: rt}
}

// =============================================================================
// REST surface
// =============================================================================

// Get fetches a single deployment by id.
func (s *Service) Get(ctx context.Context, id uuid.UUID) (sqlc.Deployment, error) {
	row, err := s.db.Q.GetDeployment(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Deployment{}, apierr.NotFound("deployment not found")
		}
		return sqlc.Deployment{}, apierr.Internal(err)
	}
	return row, nil
}

// List returns deployments for a project, optionally filtered by env slug.
// `envSlug` nil → all envs.
func (s *Service) List(ctx context.Context, projectID uuid.UUID, envSlug *string, limit, offset int32) ([]sqlc.Deployment, error) {
	if limit <= 0 {
		limit = 50
	}
	if envSlug != nil {
		envRow, err := s.env.GetBySlug(ctx, projectID, *envSlug)
		if err != nil {
			return nil, err
		}
		rows, err := s.db.Q.ListDeploymentsByProjectEnv(ctx, sqlc.ListDeploymentsByProjectEnvParams{
			ProjectID:     pgxid.PgUUID(projectID),
			EnvironmentID: envRow.ID,
			Limit:         limit,
			Offset:        offset,
		})
		if err != nil {
			return nil, apierr.Internal(err)
		}
		return rows, nil
	}
	rows, err := s.db.Q.ListDeploymentsByProject(ctx, sqlc.ListDeploymentsByProjectParams{
		ProjectID: pgxid.PgUUID(projectID),
		Limit:     limit,
		Offset:    offset,
	})
	if err != nil {
		return nil, apierr.Internal(err)
	}
	return rows, nil
}

// ListForResource returns deployments whose snapshot slice for the given
// resource differs from the prior deployment's slice — i.e. deployments
// that *changed* something for this service. Variables scoped to other
// resources (or project-wide variables) are intentionally excluded from
// the slice; the per-service tab only flags resource-attributable changes.
func (s *Service) ListForResource(ctx context.Context, projectID, resourceID uuid.UUID, envSlug *string, limit, offset int32) ([]sqlc.Deployment, error) {
	if limit <= 0 {
		limit = 50
	}
	// Cap pre-filter fetch — filtering walks pairwise so we need history
	// to diff against. 200 is the same upper bound as the spec query.
	rows, err := s.List(ctx, projectID, envSlug, 200, 0)
	if err != nil {
		return nil, err
	}
	filtered, err := filterByResourceChanges(rows, resourceID)
	if err != nil {
		return nil, apierr.Internal(err)
	}
	if int(offset) >= len(filtered) {
		return nil, nil
	}
	filtered = filtered[offset:]
	if int(limit) < len(filtered) {
		filtered = filtered[:limit]
	}
	return filtered, nil
}

// Create inserts a new deployment row and fires the async runApply goroutine.
// `envSlug` nil → resolves to the production env.
func (s *Service) Create(ctx context.Context, projectID uuid.UUID, envSlug *string) (sqlc.Deployment, error) {
	slug := environment.DefaultSlug
	if envSlug != nil && *envSlug != "" {
		slug = *envSlug
	}
	envRow, err := s.env.GetBySlug(ctx, projectID, slug)
	if err != nil {
		return sqlc.Deployment{}, err
	}
	snapshot, err := s.buildSnapshot(ctx, projectID, uuid.UUID(envRow.ID.Bytes))
	if err != nil {
		return sqlc.Deployment{}, apierr.Internal(err)
	}
	dep, err := s.db.Q.CreateDeployment(ctx, sqlc.CreateDeploymentParams{
		ID:            pgxid.PgUUID(uuid.New()),
		ProjectID:     pgxid.PgUUID(projectID),
		EnvironmentID: envRow.ID,
		Status:        sqlc.DeploymentStatusPending,
		Snapshot:      snapshot,
	})
	if err != nil {
		if pgerr.IsUniqueViolation(err) {
			return sqlc.Deployment{}, apierr.Conflict("deployment already in progress for this environment")
		}
		return sqlc.Deployment{}, apierr.Internal(err)
	}
	depID := uuid.UUID(dep.ID.Bytes)
	go s.runApply(depID)
	return dep, nil
}

// =============================================================================
// Async apply
// =============================================================================

// runApply runs a single deployment to completion. Detached from the request
// context — apply lives past the HTTP response. Bounded by applyTimeout.
//
// Re-entrant: spawning a second goroutine for the same depID is harmless;
// each one runs the full Build → Apply → Prune sequence, and SSA semantics
// are idempotent. Boot recovery relies on this.
func (s *Service) runApply(depID uuid.UUID) {
	ctx, cancel := context.WithTimeout(context.Background(), applyTimeout)
	defer cancel()

	if _, err := s.db.Q.UpdateDeploymentStatus(ctx, sqlc.UpdateDeploymentStatusParams{
		ID:     pgxid.PgUUID(depID),
		Status: sqlc.DeploymentStatusApplying,
		Error:  nil,
	}); err != nil {
		slog.Error("deployment: mark applying", "id", depID, "error", err)
		return
	}

	dep, err := s.db.Q.GetDeployment(ctx, pgxid.PgUUID(depID))
	if err != nil {
		s.markFailed(ctx, depID, "load deployment: "+err.Error())
		return
	}
	projectID := uuid.UUID(dep.ProjectID.Bytes)
	envID := uuid.UUID(dep.EnvironmentID.Bytes)

	project, state, envSlug, err := s.loadSnapshot(ctx, projectID, envID)
	if err != nil {
		s.markFailed(ctx, depID, "load snapshot: "+err.Error())
		return
	}

	if err := s.rt.Apply(ctx, project, envSlug, state); err != nil {
		s.markFailed(ctx, depID, err.Error())
		return
	}

	// Best-effort: correlate this deployment to the k8s rollout it produced so
	// events can be attributed back to it. Never fails the deploy.
	s.recordRollouts(ctx, depID, project, envSlug, state)

	if _, err := s.db.Q.MarkDeploymentApplied(ctx, pgxid.PgUUID(depID)); err != nil {
		slog.Error("deployment: mark applied", "id", depID, "error", err)
		return
	}
	slog.Info("deployment applied", "id", depID, "project", project.Slug, "env", envSlug)
}

// recordRollouts reads back the pod-template-hash per resource and persists the
// deployment↔rollout mapping. Best-effort — logs and moves on so correlation
// gaps never block a deploy.
func (s *Service) recordRollouts(ctx context.Context, depID uuid.UUID, project Project, envSlug string, state State) {
	hashes, err := s.rt.RolloutHashes(ctx, project, envSlug, state)
	if err != nil {
		slog.Warn("deployment: rollout hashes", "id", depID, "error", err)
	}
	if len(hashes) == 0 {
		return
	}
	for _, res := range state.Resources {
		hash, ok := hashes[res.Slug]
		if !ok {
			continue
		}
		if err := s.db.Q.RecordRollout(ctx, sqlc.RecordRolloutParams{
			DeploymentID:    pgxid.PgUUID(depID),
			ResourceID:      pgxid.PgUUID(res.ID),
			PodTemplateHash: hash,
		}); err != nil {
			slog.Warn("deployment: record rollout", "id", depID, "resource", res.Slug, "error", err)
		}
	}
}

func (s *Service) markFailed(ctx context.Context, depID uuid.UUID, reason string) {
	slog.Error("deployment failed", "id", depID, "reason", reason)
	bg, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := s.db.Q.MarkDeploymentFailed(bg, sqlc.MarkDeploymentFailedParams{
		ID:    pgxid.PgUUID(depID),
		Error: &reason,
	})
	if err != nil {
		slog.Error("deployment: mark failed", "id", depID, "error", err)
	}
	_ = ctx
}

// =============================================================================
// Snapshot loading
// =============================================================================

// loadSnapshot pulls project + env-scoped state from the DB and returns the
// runtime-facing Project + State + env slug.
func (s *Service) loadSnapshot(ctx context.Context, projectID, envID uuid.UUID) (Project, State, string, error) {
	pid := pgxid.PgUUID(projectID)
	eid := pgxid.PgUUID(envID)

	projectRow, err := s.db.Q.GetProject(ctx, pid)
	if err != nil {
		return Project{}, State{}, "", err
	}
	envRow, err := s.db.Q.GetEnvironment(ctx, eid)
	if err != nil {
		return Project{}, State{}, "", err
	}

	resources, err := s.db.Q.ListResourcesByProject(ctx, pid)
	if err != nil {
		return Project{}, State{}, "", err
	}
	registries, err := s.db.Q.ListRegistries(ctx)
	if err != nil {
		return Project{}, State{}, "", err
	}
	routes, err := s.db.Q.ListRoutesByProjectEnv(ctx, sqlc.ListRoutesByProjectEnvParams{
		ProjectID:     pid,
		EnvironmentID: eid,
	})
	if err != nil {
		return Project{}, State{}, "", err
	}
	variables, err := s.db.Q.ListVariablesByProjectEnv(ctx, sqlc.ListVariablesByProjectEnvParams{
		ProjectID:     pid,
		EnvironmentID: eid,
	})
	if err != nil {
		return Project{}, State{}, "", err
	}
	imports, err := s.db.Q.ListResourceImportsByEnv(ctx, sqlc.ListResourceImportsByEnvParams{
		ProjectID:     pid,
		EnvironmentID: eid,
	})
	if err != nil {
		return Project{}, State{}, "", err
	}

	state := State{
		Resources:         make([]Resource, len(resources)),
		Registries:        make([]Registry, len(registries)),
		Routes:            make([]Route, len(routes)),
		Variables:         make([]Variable, len(variables)),
		ResourceVariables: make([]ResourceVariable, len(imports)),
	}
	for i, r := range resources {
		state.Resources[i] = Resource{
			ID:        uuid.UUID(r.ID.Bytes),
			Name:      r.Name,
			Slug:      r.Slug,
			Kind:      r.Kind,
			Spec:      r.Spec,
			PositionX: r.PositionX,
			PositionY: r.PositionY,
		}
	}
	for i, r := range registries {
		// TODO real decryption — current variable code stores plaintext bytes.
		state.Registries[i] = Registry{
			ID:       uuid.UUID(r.ID.Bytes),
			Name:     r.Name,
			URL:      r.Url,
			Username: r.Username,
			Password: string(r.PasswordEncrypted),
		}
	}
	for i, rt := range routes {
		state.Routes[i] = Route{
			ID:         uuid.UUID(rt.ID.Bytes),
			ResourceID: uuid.UUID(rt.ResourceID.Bytes),
			Domain:     rt.Domain,
			Path:       rt.Path,
			PathType:   string(rt.PathType),
			Port:       rt.Port,
			TLS:        rt.Tls,
			Config:     rt.Config,
		}
	}
	for i, v := range variables {
		secret := v.Secret != nil && *v.Secret
		var value string
		if secret {
			value = string(v.ValueEncrypted) // TODO real decryption
		} else if v.Value != nil {
			value = *v.Value
		}
		var rid *uuid.UUID
		if v.ResourceID.Valid {
			id := uuid.UUID(v.ResourceID.Bytes)
			rid = &id
		}
		state.Variables[i] = Variable{
			ID:         uuid.UUID(v.ID.Bytes),
			ResourceID: rid,
			Key:        v.Key,
			Value:      value,
			Secret:     secret,
		}
	}
	for i, imp := range imports {
		state.ResourceVariables[i] = ResourceVariable{
			ResourceID: uuid.UUID(imp.ResourceID.Bytes),
			VariableID: uuid.UUID(imp.VariableID.Bytes),
			Key:        imp.Key,
		}
	}

	project := Project{
		ID:   uuid.UUID(projectRow.ID.Bytes),
		Slug: projectRow.Slug,
		Name: projectRow.Name,
	}
	return project, state, envRow.Slug, nil
}

// =============================================================================
// Boot recovery
// =============================================================================

// RecoverActive re-fires goroutines for any deployment row stuck in
// pending/applying. Idempotent because the goroutine path re-runs the full
// Apply from scratch and SSA semantics are idempotent.
func (s *Service) RecoverActive(ctx context.Context) error {
	rows, err := s.db.Q.ListActiveDeployments(ctx)
	if err != nil {
		return err
	}
	for _, row := range rows {
		id := uuid.UUID(row.ID.Bytes)
		slog.Info("deployment: recovering active", "id", id, "status", row.Status)
		go s.runApply(id)
	}
	return nil
}
