package resource

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"

	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
)

// extractRoutes pops the "routes" array out of a spec JSON document and
// returns the raw entries plus the spec without routes.
func extractRoutes(spec json.RawMessage) ([]json.RawMessage, json.RawMessage, error) {
	if len(spec) == 0 || string(spec) == "null" {
		return nil, json.RawMessage("{}"), nil
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(spec, &m); err != nil {
		return nil, nil, err
	}
	var routes []json.RawMessage
	if raw, ok := m["routes"]; ok {
		_ = json.Unmarshal(raw, &routes)
		delete(m, "routes")
	}
	clean, err := json.Marshal(m)
	if err != nil {
		return nil, nil, err
	}
	return routes, clean, nil
}

type embeddedRoute struct {
	Domain   string          `json:"domain"`
	Path     string          `json:"path"`
	PathType string          `json:"pathType"`
	Port     int32           `json:"port"`
	Tls      bool            `json:"tls"`
	Config   json.RawMessage `json:"config,omitempty"`
}

func persistEmbeddedRoute(ctx context.Context, q *sqlc.Queries, projectID, environmentID, resourceID uuid.UUID, raw json.RawMessage) error {
	var er embeddedRoute
	if err := json.Unmarshal(raw, &er); err != nil {
		return nil // ignore malformed entries
	}
	if er.PathType == "" {
		er.PathType = "prefix"
	}
	cfg := er.Config
	if cfg == nil {
		cfg = json.RawMessage("{}")
	}
	_, err := q.CreateRoute(ctx, sqlc.CreateRouteParams{
		ID:            pgxid.PgUUID(uuid.New()),
		ProjectID:     pgxid.PgUUID(projectID),
		EnvironmentID: pgxid.PgUUID(environmentID),
		ResourceID:    pgxid.PgUUID(resourceID),
		Domain:        er.Domain,
		Path:          er.Path,
		PathType:      sqlc.RoutePathType(er.PathType),
		Port:          er.Port,
		Tls:           er.Tls,
		Config:        cfg,
	})
	return err
}

func persistEmbeddedVariable(ctx context.Context, q *sqlc.Queries, projectID, environmentID, resourceID uuid.UUID, v openapi.ResourceVariableCreate) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	var probe struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return nil
	}
	switch probe.Kind {
	case "owned":
		owned, err := v.AsResourceVariableCreate0()
		if err != nil {
			return nil
		}
		secret := owned.Secret != nil && *owned.Secret
		if secret {
			cipher := []byte{}
			if owned.Value != nil {
				cipher = []byte(*owned.Value)
			}
			_, err = q.CreateSecretVariable(ctx, sqlc.CreateSecretVariableParams{
				ID:             pgxid.PgUUID(uuid.New()),
				ProjectID:      pgxid.PgUUID(projectID),
				EnvironmentID:  pgxid.PgUUID(environmentID),
				ResourceID:     pgxid.PgUUID(resourceID),
				Key:            owned.Key,
				ValueEncrypted: cipher,
			})
		} else {
			_, err = q.CreatePlainVariable(ctx, sqlc.CreatePlainVariableParams{
				ID:            pgxid.PgUUID(uuid.New()),
				ProjectID:     pgxid.PgUUID(projectID),
				EnvironmentID: pgxid.PgUUID(environmentID),
				ResourceID:    pgxid.PgUUID(resourceID),
				Key:           owned.Key,
				Value:         owned.Value,
			})
		}
		return err
	case "imported":
		imported, err := v.AsResourceVariableCreate1()
		if err != nil {
			return nil
		}
		_, err = q.CreateResourceVariable(ctx, sqlc.CreateResourceVariableParams{
			ProjectID:     pgxid.PgUUID(projectID),
			EnvironmentID: pgxid.PgUUID(environmentID),
			ResourceID:    pgxid.PgUUID(resourceID),
			VariableID:    pgxid.PgUUID(uuid.UUID(imported.SourceVariableId)),
			Key:           imported.Key,
		})
		return err
	}
	return nil
}
