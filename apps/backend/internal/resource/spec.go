package resource

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"github.com/vyftlabs/vyft/apps/backend/internal/connref"
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

// postgresConnVars maps the exported env-var name → key in the CNPG-generated
// "<slug>-app" secret. Seeded as owned secret-ref variables so other resources
// can import the connection without the password ever entering our store.
var postgresConnVars = []struct{ Key, SecretKey string }{
	{"DATABASE_URL", "uri"},
	{"PGHOST", "host"},
	{"PGPORT", "port"},
	{"PGUSER", "username"},
	{"PGPASSWORD", "password"},
	{"PGDATABASE", "dbname"},
}

// seedPostgresConnVars creates the owned secret-ref variables for a postgres
// resource. The secret name is deterministic ("<slug>-app"), so this runs at
// create time even though CNPG fills the secret's values asynchronously.
func seedPostgresConnVars(ctx context.Context, q *sqlc.Queries, projectID, environmentID, resourceID uuid.UUID, slug string) error {
	secretName := slug + "-app"
	for _, cv := range postgresConnVars {
		val := connref.Value(secretName, cv.SecretKey)
		if _, err := q.CreatePlainVariable(ctx, sqlc.CreatePlainVariableParams{
			ID:            pgxid.PgUUID(uuid.New()),
			ProjectID:     pgxid.PgUUID(projectID),
			EnvironmentID: pgxid.PgUUID(environmentID),
			ResourceID:    pgxid.PgUUID(resourceID),
			Key:           cv.Key,
			Value:         &val,
		}); err != nil {
			return err
		}
	}
	return nil
}

// randomSecret returns a URL-safe random token for generated credentials.
func randomSecret() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// seedRedisConnVars creates the owned connection variables for a redis
// resource. Unlike postgres (where CNPG owns the password), we generate the
// password ourselves, so REDIS_PASSWORD/REDIS_URL are stored secret values —
// buildRedis reads REDIS_PASSWORD to configure auth, and apps import them.
// HOST/PORT are deterministic plain values.
func seedRedisConnVars(ctx context.Context, q *sqlc.Queries, projectID, environmentID, resourceID uuid.UUID, slug string) error {
	pw := randomSecret()
	plain := []struct{ Key, Val string }{
		{"REDIS_HOST", slug},
		{"REDIS_PORT", "6379"},
	}
	for _, kv := range plain {
		val := kv.Val
		if _, err := q.CreatePlainVariable(ctx, sqlc.CreatePlainVariableParams{
			ID:            pgxid.PgUUID(uuid.New()),
			ProjectID:     pgxid.PgUUID(projectID),
			EnvironmentID: pgxid.PgUUID(environmentID),
			ResourceID:    pgxid.PgUUID(resourceID),
			Key:           kv.Key,
			Value:         &val,
		}); err != nil {
			return err
		}
	}
	secret := []struct{ Key, Val string }{
		{"REDIS_PASSWORD", pw},
		{"REDIS_URL", fmt.Sprintf("redis://default:%s@%s:6379", pw, slug)},
	}
	for _, kv := range secret {
		if _, err := q.CreateSecretVariable(ctx, sqlc.CreateSecretVariableParams{
			ID:             pgxid.PgUUID(uuid.New()),
			ProjectID:      pgxid.PgUUID(projectID),
			EnvironmentID:  pgxid.PgUUID(environmentID),
			ResourceID:     pgxid.PgUUID(resourceID),
			Key:            kv.Key,
			ValueEncrypted: []byte(kv.Val),
		}); err != nil {
			return err
		}
	}
	return nil
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
