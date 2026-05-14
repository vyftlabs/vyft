package deployment

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
)

// Restore reverts the resource's spec, its routes, and its resource-scoped
// variables to match the deployment snapshot's slice for that resource.
// Does not trigger a deployment — callers stage the change and then deploy.
//
// Secret variable values are not present in the snapshot (deliberately, see
// snapshot.go). For secret vars that still exist, the current ciphertext is
// preserved. For secret vars that need to be recreated, an empty placeholder
// is written; the user must re-enter the value before deploying.
//
// Imports (resource_variables table) are not in the snapshot and are not
// touched by restore — a known limitation shared with the deploy path.
func (s *Service) Restore(ctx context.Context, projectID, resourceID, deploymentID uuid.UUID) error {
	dep, err := s.db.Q.GetDeployment(ctx, pgxid.PgUUID(deploymentID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.NotFound("deployment not found")
		}
		return apierr.Internal(err)
	}
	if uuid.UUID(dep.ProjectID.Bytes) != projectID {
		return apierr.NotFound("deployment not found")
	}
	envID := uuid.UUID(dep.EnvironmentID.Bytes)

	var snap snapshotShape
	if err := json.Unmarshal(dep.Snapshot, &snap); err != nil {
		return apierr.Internal(err)
	}

	rid := resourceID.String()
	var snapResource *snapshotResource
	for i := range snap.Resources {
		if snap.Resources[i].ID == rid {
			snapResource = &snap.Resources[i]
			break
		}
	}
	if snapResource == nil {
		return apierr.BadRequest("deployment snapshot does not include this resource")
	}

	snapRoutes := make([]snapshotRoute, 0)
	for _, rt := range snap.Routes {
		if rt.ResourceID == rid {
			snapRoutes = append(snapRoutes, rt)
		}
	}
	snapVars := make([]snapshotVariable, 0)
	for _, v := range snap.Variables {
		if v.ResourceID != nil && *v.ResourceID == rid {
			snapVars = append(snapVars, v)
		}
	}

	specBytes, err := json.Marshal(snapResource.Spec)
	if err != nil {
		return apierr.Internal(err)
	}

	current, err := s.db.Q.GetResource(ctx, pgxid.PgUUID(resourceID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.NotFound("resource not found")
		}
		return apierr.Internal(err)
	}

	err = s.db.WithTx(ctx, func(q *sqlc.Queries) error {
		if _, err := q.UpdateResource(ctx, sqlc.UpdateResourceParams{
			ID: pgxid.PgUUID(resourceID),
			// Name is immutable post-create; keep current name to avoid
			// triggering the resource name guard.
			Name: current.Name,
			Kind: snapResource.Kind,
			Spec: specBytes,
		}); err != nil {
			return err
		}
		if err := syncRoutes(ctx, q, projectID, resourceID, envID, snapRoutes); err != nil {
			return err
		}
		if err := syncOwnedVariables(ctx, q, projectID, resourceID, envID, snapVars); err != nil {
			return err
		}
		return syncResourceReferences(ctx, q, projectID, resourceID, envID, snapVars)
	})
	if err != nil {
		return apierr.Internal(err)
	}
	return nil
}

func syncRoutes(ctx context.Context, q *sqlc.Queries, projectID, resourceID, envID uuid.UUID, target []snapshotRoute) error {
	current, err := q.ListRoutesByResourceEnv(ctx, sqlc.ListRoutesByResourceEnvParams{
		ResourceID:    pgxid.PgUUID(resourceID),
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
			ResourceID:    pgxid.PgUUID(resourceID),
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

// syncResourceReferences reconciles resource_variables rows for one resource
// against the reference-kind entries in target. Mirrors discard's
// syncProjectReferences but scoped to a single resource.
func syncResourceReferences(ctx context.Context, q *sqlc.Queries, projectID, resourceID, envID uuid.UUID, target []snapshotVariable) error {
	current, err := q.ListResourceImports(ctx, sqlc.ListResourceImportsParams{
		ResourceID:    pgxid.PgUUID(resourceID),
		EnvironmentID: pgxid.PgUUID(envID),
	})
	if err != nil {
		return err
	}
	targetByKey := make(map[string]snapshotVariable)
	for _, v := range target {
		if v.Kind != "reference" {
			continue
		}
		targetByKey[v.Key] = v
	}
	currentByKey := make(map[string]bool, len(current))
	for _, c := range current {
		currentByKey[c.Key] = true
		if _, keep := targetByKey[c.Key]; !keep {
			if err := q.DeleteResourceVariable(ctx, sqlc.DeleteResourceVariableParams{
				ResourceID:    c.ResourceID,
				EnvironmentID: c.EnvironmentID,
				Key:           c.Key,
			}); err != nil {
				return err
			}
		}
	}
	for k, v := range targetByKey {
		if currentByKey[k] {
			continue
		}
		vid, err := uuid.Parse(v.SourceVariableID)
		if err != nil {
			return err
		}
		if _, err := q.CreateResourceVariable(ctx, sqlc.CreateResourceVariableParams{
			ProjectID:     pgxid.PgUUID(projectID),
			EnvironmentID: pgxid.PgUUID(envID),
			ResourceID:    pgxid.PgUUID(resourceID),
			VariableID:    pgxid.PgUUID(vid),
			Key:           k,
		}); err != nil {
			return err
		}
	}
	return nil
}

func syncOwnedVariables(ctx context.Context, q *sqlc.Queries, projectID, resourceID, envID uuid.UUID, target []snapshotVariable) error {
	current, err := q.ListOwnedVariables(ctx, sqlc.ListOwnedVariablesParams{
		ProjectID:     pgxid.PgUUID(projectID),
		EnvironmentID: pgxid.PgUUID(envID),
		ResourceID:    pgxid.PgUUID(resourceID),
	})
	if err != nil {
		return err
	}
	targetByID := make(map[string]snapshotVariable, len(target))
	for _, v := range target {
		// References live in resource_variables — handled by
		// syncResourceReferences. Skip here to avoid empty-id collisions.
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
			// Secret vars: snapshot has no plaintext, leave ciphertext as-is.
			continue
		}
		if sv.Secret {
			// Snapshot doesn't carry the secret value. Create an empty
			// placeholder so the var exists; user must set the value
			// manually before deploy.
			if _, err := q.CreateSecretVariable(ctx, sqlc.CreateSecretVariableParams{
				ID:             pgxid.PgUUID(svID),
				ProjectID:      pgxid.PgUUID(projectID),
				EnvironmentID:  pgxid.PgUUID(envID),
				ResourceID:     pgxid.PgUUID(resourceID),
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
			ResourceID:    pgxid.PgUUID(resourceID),
			Key:           sv.Key,
			Value:         &val,
		}); err != nil {
			return err
		}
	}
	return nil
}
