package deployment

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
)

// Discard reverts all staged project changes by writing the latest applied
// deployment's snapshot back as the current state. Operates against the
// default environment (matching DeployButton's scope on the frontend).
//
// 409 if no applied deployment exists yet — nothing to revert *to*. The
// caller (UI) gates this by hiding the button until an applied deployment
// is available.
//
// Secret values are not in the snapshot — preserved when the variable still
// exists, blanked when recreated (user must re-enter before deploy).
func (s *Service) Discard(ctx context.Context, projectID uuid.UUID) error {
	envID, err := s.env.DefaultID(ctx, projectID)
	if err != nil {
		return err
	}
	baseline, err := s.latestApplied(ctx, projectID, envID)
	if err != nil {
		return err
	}
	if baseline == nil {
		return apierr.Conflict("no applied deployment to discard to")
	}
	var snap snapshotShape
	if err := json.Unmarshal(baseline.Snapshot, &snap); err != nil {
		return apierr.Internal(err)
	}

	err = s.db.WithTx(ctx, func(q *sqlc.Queries) error {
		if err := syncProjectResources(ctx, q, projectID, snap.Resources); err != nil {
			return err
		}
		if err := syncProjectRoutes(ctx, q, projectID, envID, snap.Routes); err != nil {
			return err
		}
		if err := syncProjectVariables(ctx, q, projectID, envID, snap.Variables); err != nil {
			return err
		}
		if err := syncProjectReferences(ctx, q, projectID, envID, snap.Variables); err != nil {
			return err
		}
		// The UPDATE statements above triggered touch_updated on every
		// affected row, bumping their updated_at — even though content
		// now matches the baseline snapshot. The frontend's deploy-gate
		// hash includes updated_at, so without this fixup the Deploy
		// button would stay lit after a discard.
		//
		// Rebuild the snapshot from the (now-current) state and overwrite
		// the baseline deployment's snapshot column. Content is unchanged;
		// only the embedded timestamps move forward to match reality.
		fresh, err := buildSnapshotWith(ctx, q, projectID, envID)
		if err != nil {
			return err
		}
		return q.UpdateDeploymentSnapshot(ctx, sqlc.UpdateDeploymentSnapshotParams{
			ID:       baseline.ID,
			Snapshot: fresh,
		})
	})
	if err != nil {
		return apierr.Internal(err)
	}
	return nil
}

// latestApplied scans deployment history newest→oldest and returns the
// first applied row, or nil if none exists.
func (s *Service) latestApplied(ctx context.Context, projectID, envID uuid.UUID) (*sqlc.Deployment, error) {
	rows, err := s.db.Q.ListDeploymentsByProjectEnv(ctx, sqlc.ListDeploymentsByProjectEnvParams{
		ProjectID:     pgxid.PgUUID(projectID),
		EnvironmentID: pgxid.PgUUID(envID),
		Limit:         100,
		Offset:        0,
	})
	if err != nil {
		return nil, apierr.Internal(err)
	}
	for i := range rows {
		if rows[i].Status == sqlc.DeploymentStatusApplied {
			return &rows[i], nil
		}
	}
	return nil, nil
}

func syncProjectResources(ctx context.Context, q *sqlc.Queries, projectID uuid.UUID, target []snapshotResource) error {
	current, err := q.ListResourcesByProject(ctx, pgxid.PgUUID(projectID))
	if err != nil {
		return err
	}
	targetByID := make(map[string]snapshotResource, len(target))
	for _, r := range target {
		targetByID[r.ID] = r
	}
	currentByID := make(map[string]sqlc.Resource, len(current))
	for _, r := range current {
		id := uuid.UUID(r.ID.Bytes).String()
		currentByID[id] = r
		if _, keep := targetByID[id]; !keep {
			// Cascades to routes + variables for this resource.
			if err := q.DeleteResource(ctx, r.ID); err != nil {
				return err
			}
		}
	}
	for _, sr := range target {
		specBytes, err := json.Marshal(sr.Spec)
		if err != nil {
			return err
		}
		cur, exists := currentByID[sr.ID]
		if exists {
			if _, err := q.UpdateResource(ctx, sqlc.UpdateResourceParams{
				ID:   cur.ID,
				Name: cur.Name, // name is immutable post-create
				Kind: sr.Kind,
				Spec: specBytes,
			}); err != nil {
				return err
			}
			continue
		}
		srID, err := uuid.Parse(sr.ID)
		if err != nil {
			return err
		}
		// Position isn't in the snapshot — restored resources land at the
		// origin. Acceptable for MVP discard; users rarely revert a delete.
		if _, err := q.CreateResource(ctx, sqlc.CreateResourceParams{
			ID:        pgxid.PgUUID(srID),
			ProjectID: pgxid.PgUUID(projectID),
			Name:      sr.Name,
			Slug:      sr.Slug,
			Kind:      sr.Kind,
			PositionX: 0,
			PositionY: 0,
			Spec:      specBytes,
		}); err != nil {
			return err
		}
	}
	return nil
}

func syncProjectRoutes(ctx context.Context, q *sqlc.Queries, projectID, envID uuid.UUID, target []snapshotRoute) error {
	current, err := q.ListRoutesByProjectEnv(ctx, sqlc.ListRoutesByProjectEnvParams{
		ProjectID:     pgxid.PgUUID(projectID),
		EnvironmentID: pgxid.PgUUID(envID),
	})
	if err != nil {
		return err
	}
	targetByID := make(map[string]snapshotRoute, len(target))
	for _, r := range target {
		targetByID[r.ID] = r
	}
	currentIDs := make(map[string]bool, len(current))
	for _, r := range current {
		id := uuid.UUID(r.ID.Bytes).String()
		currentIDs[id] = true
		if _, keep := targetByID[id]; !keep {
			if err := q.DeleteRoute(ctx, r.ID); err != nil {
				return err
			}
		}
	}
	for _, sr := range target {
		cfgBytes, err := json.Marshal(sr.Config)
		if err != nil {
			return err
		}
		srID, err := uuid.Parse(sr.ID)
		if err != nil {
			return err
		}
		ridUUID, err := uuid.Parse(sr.ResourceID)
		if err != nil {
			return err
		}
		if currentIDs[sr.ID] {
			if _, err := q.UpdateRoute(ctx, sqlc.UpdateRouteParams{
				ID:       pgxid.PgUUID(srID),
				Domain:   sr.Domain,
				Path:     sr.Path,
				PathType: sqlc.RoutePathType(sr.PathType),
				Port:     sr.Port,
				Tls:      sr.TLS,
				Config:   cfgBytes,
			}); err != nil {
				return err
			}
			continue
		}
		if _, err := q.CreateRoute(ctx, sqlc.CreateRouteParams{
			ID:            pgxid.PgUUID(srID),
			ProjectID:     pgxid.PgUUID(projectID),
			EnvironmentID: pgxid.PgUUID(envID),
			ResourceID:    pgxid.PgUUID(ridUUID),
			Domain:        sr.Domain,
			Path:          sr.Path,
			PathType:      sqlc.RoutePathType(sr.PathType),
			Port:          sr.Port,
			Tls:           sr.TLS,
			Config:        cfgBytes,
		}); err != nil {
			return err
		}
	}
	return nil
}

// syncProjectReferences reconciles resource_variables rows against the
// reference-kind entries in the snapshot's variables array. Identity is
// (resourceId, key); add the ones present in target, drop the ones not.
func syncProjectReferences(ctx context.Context, q *sqlc.Queries, projectID, envID uuid.UUID, target []snapshotVariable) error {
	current, err := q.ListResourceImportsByEnv(ctx, sqlc.ListResourceImportsByEnvParams{
		ProjectID:     pgxid.PgUUID(projectID),
		EnvironmentID: pgxid.PgUUID(envID),
	})
	if err != nil {
		return err
	}
	type refKey struct {
		ResourceID string
		Key        string
	}
	targetSet := make(map[refKey]snapshotVariable)
	for _, v := range target {
		if v.Kind != "reference" || v.ResourceID == nil {
			continue
		}
		targetSet[refKey{*v.ResourceID, v.Key}] = v
	}
	currentSet := make(map[refKey]bool, len(current))
	for _, c := range current {
		rid := uuid.UUID(c.ResourceID.Bytes).String()
		k := refKey{rid, c.Key}
		currentSet[k] = true
		if _, keep := targetSet[k]; !keep {
			if err := q.DeleteResourceVariable(ctx, sqlc.DeleteResourceVariableParams{
				ResourceID:    c.ResourceID,
				EnvironmentID: c.EnvironmentID,
				Key:           c.Key,
			}); err != nil {
				return err
			}
		}
	}
	for k, v := range targetSet {
		if currentSet[k] {
			continue
		}
		rid, err := uuid.Parse(k.ResourceID)
		if err != nil {
			return err
		}
		vid, err := uuid.Parse(v.SourceVariableID)
		if err != nil {
			return err
		}
		if _, err := q.CreateResourceVariable(ctx, sqlc.CreateResourceVariableParams{
			ProjectID:     pgxid.PgUUID(projectID),
			EnvironmentID: pgxid.PgUUID(envID),
			ResourceID:    pgxid.PgUUID(rid),
			VariableID:    pgxid.PgUUID(vid),
			Key:           k.Key,
		}); err != nil {
			return err
		}
	}
	return nil
}

func syncProjectVariables(ctx context.Context, q *sqlc.Queries, projectID, envID uuid.UUID, target []snapshotVariable) error {
	current, err := q.ListVariablesByProjectEnv(ctx, sqlc.ListVariablesByProjectEnvParams{
		ProjectID:     pgxid.PgUUID(projectID),
		EnvironmentID: pgxid.PgUUID(envID),
	})
	if err != nil {
		return err
	}
	targetByID := make(map[string]snapshotVariable, len(target))
	for _, v := range target {
		// Skip reference entries — they're handled by syncProjectReferences
		// against the resource_variables table. References have no surrogate
		// id and would collide on the empty-string key.
		if v.Kind != "owned" {
			continue
		}
		targetByID[v.ID] = v
	}
	currentByID := make(map[string]sqlc.Variable, len(current))
	for _, v := range current {
		id := uuid.UUID(v.ID.Bytes).String()
		currentByID[id] = v
		if _, keep := targetByID[id]; !keep {
			if err := q.DeleteVariable(ctx, v.ID); err != nil {
				return err
			}
		}
	}
	for _, sv := range target {
		if sv.Kind != "owned" {
			continue
		}
		svID, err := uuid.Parse(sv.ID)
		if err != nil {
			return err
		}
		var residentResourceID pgtype.UUID
		if sv.ResourceID != nil {
			rid, err := uuid.Parse(*sv.ResourceID)
			if err != nil {
				return err
			}
			residentResourceID = pgxid.PgUUID(rid)
		}
		cur, exists := currentByID[sv.ID]
		if exists {
			if cur.Key != sv.Key {
				if _, err := q.UpdateVariableKey(ctx, sqlc.UpdateVariableKeyParams{
					ID:  cur.ID,
					Key: sv.Key,
				}); err != nil {
					return err
				}
			}
			if !sv.Secret {
				val := sv.Value
				if _, err := q.UpdatePlainVariableValue(ctx, sqlc.UpdatePlainVariableValueParams{
					ID:    cur.ID,
					Value: &val,
				}); err != nil {
					return err
				}
			}
			continue
		}
		if sv.Secret {
			if _, err := q.CreateSecretVariable(ctx, sqlc.CreateSecretVariableParams{
				ID:             pgxid.PgUUID(svID),
				ProjectID:      pgxid.PgUUID(projectID),
				EnvironmentID:  pgxid.PgUUID(envID),
				ResourceID:     residentResourceID,
				Key:            sv.Key,
				ValueEncrypted: []byte{},
			}); err != nil {
				return err
			}
			continue
		}
		val := sv.Value
		if _, err := q.CreatePlainVariable(ctx, sqlc.CreatePlainVariableParams{
			ID:            pgxid.PgUUID(svID),
			ProjectID:     pgxid.PgUUID(projectID),
			EnvironmentID: pgxid.PgUUID(envID),
			ResourceID:    residentResourceID,
			Key:           sv.Key,
			Value:         &val,
		}); err != nil {
			return err
		}
	}
	return nil
}
