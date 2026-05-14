// Package variable owns business logic for the variables entity:
//
//   - shared variables (project-scoped, identified by id)
//   - resource env (owned + imported, identified by key per resource)
//
// Every read/write is scoped by (project_id, environment_id). v1 callers
// don't pass env explicitly — the service resolves the production env via
// the env service helper.
package variable

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/environment"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgerr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
)

// peekKind extracts the "kind" discriminator from a JSON-marshalable union.
// Used because oapi-codegen only generates Discriminator() on response unions.
func peekKind(v any) (string, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	var probe struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return "", err
	}
	return probe.Kind, nil
}

type Service struct {
	db  *db.DB
	env *environment.Service
}

func New(d *db.DB, env *environment.Service) *Service { return &Service{db: d, env: env} }

func (s *Service) defaultEnvID(ctx context.Context, projectID uuid.UUID) (uuid.UUID, error) {
	return s.env.DefaultID(ctx, projectID)
}

// =============================================================================
// Project variables (all — shared + owned)
// =============================================================================

// List returns every variable in the project, scoped to the production env.
// Frontend slices by `resourceId` for context-specific views.
func (s *Service) List(ctx context.Context, projectID uuid.UUID) ([]openapi.Variable, error) {
	envID, err := s.defaultEnvID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.Q.ListVariablesByProjectEnv(ctx, sqlc.ListVariablesByProjectEnvParams{
		ProjectID:     pgxid.PgUUID(projectID),
		EnvironmentID: pgxid.PgUUID(envID),
	})
	if err != nil {
		return nil, apierr.Internal(err)
	}
	out := make([]openapi.Variable, 0, len(rows))
	for _, v := range rows {
		usedBy, _ := s.usedBy(ctx, v.ID)
		out = append(out, variableToWire(v, usedBy))
	}
	return out, nil
}

func (s *Service) Get(ctx context.Context, id uuid.UUID) (openapi.Variable, error) {
	v, err := s.db.Q.GetVariable(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return openapi.Variable{}, apierr.NotFound("variable not found")
		}
		return openapi.Variable{}, apierr.Internal(err)
	}
	usedBy, _ := s.usedBy(ctx, v.ID)
	return variableToWire(v, usedBy), nil
}

// Create makes a shared (project-level) variable. resource_id is null.
// Resource-owned variables go through CreateResourceEnv.
func (s *Service) Create(ctx context.Context, projectID uuid.UUID, body openapi.VariableCreate) (openapi.Variable, error) {
	if body.Key == "" {
		return openapi.Variable{}, apierr.BadRequest("key required")
	}
	envID, err := s.defaultEnvID(ctx, projectID)
	if err != nil {
		return openapi.Variable{}, err
	}
	secret := body.Secret != nil && *body.Secret
	v, err := s.createVariable(ctx, pgxid.PgUUID(projectID), pgxid.PgUUID(envID), pgtype.UUID{}, body.Key, body.Value, secret)
	if err != nil {
		return openapi.Variable{}, apierr.Wrap(err)
	}
	return variableToWire(v, nil), nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, body openapi.VariableUpdate) (openapi.Variable, error) {
	v, err := s.applyUpdate(ctx, pgxid.PgUUID(id), body.Key, body.Value, body.Secret)
	if err != nil {
		return openapi.Variable{}, apierr.Wrap(err)
	}
	usedBy, _ := s.usedBy(ctx, v.ID)
	return variableToWire(v, usedBy), nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	// FK from resource_variables.variable_id → variables.id is ON DELETE
	// CASCADE; importer rows vanish with the source.
	if err := s.db.Q.DeleteVariable(ctx, pgxid.PgUUID(id)); err != nil {
		return apierr.Internal(err)
	}
	return nil
}

// =============================================================================
// Resource env
// =============================================================================

func (s *Service) ListResourceEnv(ctx context.Context, projectID, resourceID uuid.UUID) ([]openapi.ResourceVariable, error) {
	envID, err := s.defaultEnvID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	owned, err := s.db.Q.ListOwnedVariables(ctx, sqlc.ListOwnedVariablesParams{
		ProjectID:     pgxid.PgUUID(projectID),
		EnvironmentID: pgxid.PgUUID(envID),
		ResourceID:    pgxid.PgUUID(resourceID),
	})
	if err != nil {
		return nil, apierr.Internal(err)
	}
	imports, err := s.db.Q.ListResourceImports(ctx, sqlc.ListResourceImportsParams{
		ResourceID:    pgxid.PgUUID(resourceID),
		EnvironmentID: pgxid.PgUUID(envID),
	})
	if err != nil {
		return nil, apierr.Internal(err)
	}

	out := make([]openapi.ResourceVariable, 0, len(owned)+len(imports))
	for _, v := range owned {
		rv, err := wrapOwned(ownedToWire(v))
		if err != nil {
			return nil, apierr.Internal(err)
		}
		out = append(out, rv)
	}
	for _, imp := range imports {
		src, _ := s.sourceFor(ctx, imp.VariableID)
		rv, err := wrapImported(importedToWire(imp, src))
		if err != nil {
			return nil, apierr.Internal(err)
		}
		out = append(out, rv)
	}
	return out, nil
}

func (s *Service) GetResourceEnv(ctx context.Context, projectID, resourceID uuid.UUID, key string) (openapi.ResourceVariable, error) {
	envID, err := s.defaultEnvID(ctx, projectID)
	if err != nil {
		return openapi.ResourceVariable{}, err
	}
	v, err := s.db.Q.GetOwnedVariableByKey(ctx, sqlc.GetOwnedVariableByKeyParams{
		ProjectID:     pgxid.PgUUID(projectID),
		EnvironmentID: pgxid.PgUUID(envID),
		ResourceID:    pgxid.PgUUID(resourceID),
		Key:           key,
	})
	if err == nil {
		return wrapOwned(ownedToWire(v))
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return openapi.ResourceVariable{}, apierr.Wrap(err)
	}

	imports, err := s.db.Q.ListResourceImports(ctx, sqlc.ListResourceImportsParams{
		ResourceID:    pgxid.PgUUID(resourceID),
		EnvironmentID: pgxid.PgUUID(envID),
	})
	if err != nil {
		return openapi.ResourceVariable{}, apierr.Wrap(err)
	}
	for _, imp := range imports {
		if imp.Key == key {
			src, _ := s.sourceFor(ctx, imp.VariableID)
			return wrapImported(importedToWire(imp, src))
		}
	}
	return openapi.ResourceVariable{}, apierr.NotFound("variable not found")
}

func (s *Service) CreateResourceEnv(ctx context.Context, projectID, resourceID uuid.UUID, body openapi.ResourceVariableCreate) (openapi.ResourceVariable, error) {
	envID, err := s.defaultEnvID(ctx, projectID)
	if err != nil {
		return openapi.ResourceVariable{}, err
	}
	kind, err := peekKind(body)
	if err != nil {
		return openapi.ResourceVariable{}, apierr.BadRequest("missing kind discriminator")
	}
	switch kind {
	case "owned":
		owned, err := body.AsResourceVariableCreate0()
		if err != nil {
			return openapi.ResourceVariable{}, apierr.BadRequest(err.Error())
		}
		if owned.Key == "" {
			return openapi.ResourceVariable{}, apierr.BadRequest("key required")
		}
		secret := owned.Secret != nil && *owned.Secret
		v, err := s.createVariable(ctx, pgxid.PgUUID(projectID), pgxid.PgUUID(envID), pgxid.PgUUID(resourceID), owned.Key, owned.Value, secret)
		if err != nil {
			return openapi.ResourceVariable{}, apierr.Wrap(err)
		}
		return wrapOwned(ownedToWire(v))

	case "imported":
		imported, err := body.AsResourceVariableCreate1()
		if err != nil {
			return openapi.ResourceVariable{}, apierr.BadRequest(err.Error())
		}
		row, err := s.db.Q.CreateResourceVariable(ctx, sqlc.CreateResourceVariableParams{
			ProjectID:     pgxid.PgUUID(projectID),
			EnvironmentID: pgxid.PgUUID(envID),
			ResourceID:    pgxid.PgUUID(resourceID),
			VariableID:    pgxid.PgUUID(uuid.UUID(imported.SourceVariableId)),
			Key:           imported.Key,
		})
		if err != nil {
			if pgerr.IsUniqueViolation(err) {
				return openapi.ResourceVariable{}, apierr.Conflict("key already exists on this resource")
			}
			if pgerr.IsForeignKeyViolation(err) {
				return openapi.ResourceVariable{}, apierr.BadRequest("source variable not in same project")
			}
			return openapi.ResourceVariable{}, apierr.Wrap(err)
		}
		src, _ := s.sourceFor(ctx, row.VariableID)
		return wrapImported(importedToWire(row, src))
	}
	return openapi.ResourceVariable{}, apierr.BadRequest("kind must be 'owned' or 'imported'")
}

func (s *Service) UpdateResourceEnv(ctx context.Context, projectID, resourceID uuid.UUID, key string, body openapi.ResourceVariableUpdate) (openapi.ResourceVariable, error) {
	envID, err := s.defaultEnvID(ctx, projectID)
	if err != nil {
		return openapi.ResourceVariable{}, err
	}
	kind, err := peekKind(body)
	if err != nil {
		return openapi.ResourceVariable{}, apierr.BadRequest("missing kind discriminator")
	}
	if kind == "owned" {
		owned, err := body.AsResourceVariableUpdate0()
		if err != nil {
			return openapi.ResourceVariable{}, apierr.BadRequest(err.Error())
		}
		v, err := s.db.Q.GetOwnedVariableByKey(ctx, sqlc.GetOwnedVariableByKeyParams{
			ProjectID:     pgxid.PgUUID(projectID),
			EnvironmentID: pgxid.PgUUID(envID),
			ResourceID:    pgxid.PgUUID(resourceID),
			Key:           key,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return openapi.ResourceVariable{}, apierr.NotFound("variable not found")
			}
			return openapi.ResourceVariable{}, apierr.Wrap(err)
		}
		updated, err := s.applyUpdate(ctx, v.ID, owned.Key, owned.Value, owned.Secret)
		if err != nil {
			return openapi.ResourceVariable{}, apierr.Wrap(err)
		}
		return wrapOwned(ownedToWire(updated))
	}

	// imported: composite PK (resource_id, env_id, key). Rename or repoint = drop+recreate.
	imported, err := body.AsResourceVariableUpdate1()
	if err != nil {
		return openapi.ResourceVariable{}, apierr.BadRequest(err.Error())
	}
	imports, err := s.db.Q.ListResourceImports(ctx, sqlc.ListResourceImportsParams{
		ResourceID:    pgxid.PgUUID(resourceID),
		EnvironmentID: pgxid.PgUUID(envID),
	})
	if err != nil {
		return openapi.ResourceVariable{}, apierr.Wrap(err)
	}
	var current *sqlc.ResourceVariable
	for i := range imports {
		if imports[i].Key == key {
			current = &imports[i]
			break
		}
	}
	if current == nil {
		return openapi.ResourceVariable{}, apierr.NotFound("variable not found")
	}

	newKey := key
	if imported.Key != nil {
		newKey = *imported.Key
	}
	newSrcID := current.VariableID
	if imported.SourceVariableId != nil {
		newSrcID = pgxid.PgUUID(uuid.UUID(*imported.SourceVariableId))
	}

	if err := s.db.Q.DeleteResourceVariable(ctx, sqlc.DeleteResourceVariableParams{
		ResourceID:    pgxid.PgUUID(resourceID),
		EnvironmentID: pgxid.PgUUID(envID),
		Key:           key,
	}); err != nil {
		return openapi.ResourceVariable{}, apierr.Wrap(err)
	}
	row, err := s.db.Q.CreateResourceVariable(ctx, sqlc.CreateResourceVariableParams{
		ProjectID:     pgxid.PgUUID(projectID),
		EnvironmentID: pgxid.PgUUID(envID),
		ResourceID:    pgxid.PgUUID(resourceID),
		VariableID:    newSrcID,
		Key:           newKey,
	})
	if err != nil {
		return openapi.ResourceVariable{}, apierr.Wrap(err)
	}
	src, _ := s.sourceFor(ctx, row.VariableID)
	return wrapImported(importedToWire(row, src))
}

func (s *Service) DeleteResourceEnv(ctx context.Context, projectID, resourceID uuid.UUID, key string) error {
	envID, err := s.defaultEnvID(ctx, projectID)
	if err != nil {
		return err
	}
	v, err := s.db.Q.GetOwnedVariableByKey(ctx, sqlc.GetOwnedVariableByKeyParams{
		ProjectID:     pgxid.PgUUID(projectID),
		EnvironmentID: pgxid.PgUUID(envID),
		ResourceID:    pgxid.PgUUID(resourceID),
		Key:           key,
	})
	if err == nil {
		// FK on resource_variables.variable_id is ON DELETE CASCADE; any
		// importing rows vanish along with the source variable.
		if err := s.db.Q.DeleteVariable(ctx, v.ID); err != nil {
			return apierr.Internal(err)
		}
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return apierr.Internal(err)
	}

	if err := s.db.Q.DeleteResourceVariable(ctx, sqlc.DeleteResourceVariableParams{
		ResourceID:    pgxid.PgUUID(resourceID),
		EnvironmentID: pgxid.PgUUID(envID),
		Key:           key,
	}); err != nil {
		return apierr.Internal(err)
	}
	return nil
}

// =============================================================================
// Internal helpers
// =============================================================================

func (s *Service) usedBy(ctx context.Context, variableID pgtype.UUID) ([]openapi.VariableUsage, error) {
	imports, err := s.db.Q.ListImportsOfVariable(ctx, variableID)
	if err != nil {
		return nil, apierr.Internal(err)
	}
	out := make([]openapi.VariableUsage, 0, len(imports))
	for _, imp := range imports {
		res, err := s.db.Q.GetResource(ctx, imp.ResourceID)
		if err != nil {
			continue
		}
		out = append(out, variableUsage(res, imp.Key))
	}
	return out, nil
}

func (s *Service) sourceFor(ctx context.Context, variableID pgtype.UUID) (*openapi.ImportSource, error) {
	src, err := s.db.Q.GetVariable(ctx, variableID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, apierr.Internal(err)
	}
	out := importedSourceWire(src)
	if src.ResourceID.Valid {
		if res, err := s.db.Q.GetResource(ctx, src.ResourceID); err == nil {
			out.Resource = importedSourceResourceWire(res)
		}
	}
	return out, nil
}

func (s *Service) createVariable(
	ctx context.Context,
	projectID, envID, resourceID pgtype.UUID,
	key string,
	value *string,
	secret bool,
) (sqlc.Variable, error) {
	if secret {
		ciphertext := []byte{}
		if value != nil {
			ciphertext = []byte(*value) // TODO: real encryption
		}
		v, err := s.db.Q.CreateSecretVariable(ctx, sqlc.CreateSecretVariableParams{
			ID:             pgxid.PgUUID(uuid.New()),
			ProjectID:      projectID,
			EnvironmentID:  envID,
			ResourceID:     resourceID,
			Key:            key,
			ValueEncrypted: ciphertext,
		})
		return v, mapPgError(err)
	}
	v, err := s.db.Q.CreatePlainVariable(ctx, sqlc.CreatePlainVariableParams{
		ID:            pgxid.PgUUID(uuid.New()),
		ProjectID:     projectID,
		EnvironmentID: envID,
		ResourceID:    resourceID,
		Key:           key,
		Value:         value,
	})
	return v, mapPgError(err)
}

func (s *Service) applyUpdate(
	ctx context.Context,
	id pgtype.UUID,
	keyChange *string,
	valueChange *string,
	secretChange *bool,
) (sqlc.Variable, error) {
	current, err := s.db.Q.GetVariable(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Variable{}, apierr.NotFound("variable not found")
		}
		return sqlc.Variable{}, apierr.Wrap(err)
	}

	v := current
	if keyChange != nil && *keyChange != current.Key {
		v, err = s.db.Q.UpdateVariableKey(ctx, sqlc.UpdateVariableKeyParams{
			ID:  id,
			Key: *keyChange,
		})
		if err != nil {
			return sqlc.Variable{}, mapPgError(err)
		}
	}

	currentSecret := current.Secret != nil && *current.Secret
	wantSecret := currentSecret
	if secretChange != nil {
		wantSecret = *secretChange
	}

	if valueChange != nil || (secretChange != nil && wantSecret != currentSecret) {
		val := valueChange
		if val == nil {
			val = current.Value
		}
		if wantSecret {
			cipher := []byte{}
			if val != nil {
				cipher = []byte(*val)
			}
			v, err = s.db.Q.UpdateSecretVariableValue(ctx, sqlc.UpdateSecretVariableValueParams{
				ID:             id,
				ValueEncrypted: cipher,
			})
		} else {
			v, err = s.db.Q.UpdatePlainVariableValue(ctx, sqlc.UpdatePlainVariableValueParams{
				ID:    id,
				Value: val,
			})
		}
		if err != nil {
			return sqlc.Variable{}, mapPgError(err)
		}
	}
	return v, nil
}

func mapPgError(err error) error {
	if err == nil {
		return nil
	}
	if pgerr.IsUniqueViolation(err) {
		return apierr.Conflict("key already exists in this scope")
	}
	if pgerr.IsForeignKeyViolation(err) {
		return apierr.BadRequest("foreign key constraint violated")
	}
	return apierr.Internal(err)
}
