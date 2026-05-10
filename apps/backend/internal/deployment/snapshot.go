package deployment

import (
	"context"
	"encoding/json"
	"sort"

	"github.com/google/uuid"

	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
)

// snapshotShape is the canonical reduced JSON shape stored on every
// deployment row. The frontend reconstructs an identical shape from its
// cached query data and hashes both — match means "no changes since this
// deployment".
//
// Rules so the shape round-trips byte-identically across sides:
//   - arrays sorted by id
//   - secret values omitted (frontend can't see plaintext); the row's
//     updatedAt covers value changes via the touch_updated trigger
//   - timestamps as int64 milliseconds since epoch (UTC). Avoids the tz +
//     nano-precision mismatches that string formats have between Go and JS.
//   - resources.spec is parsed JSON (map), NOT raw bytes. Both sides
//     canonical-stringify recursively so key order doesn't matter, but the
//     contents must be parseable and equivalent.
//   - imports are intentionally omitted: there's no project-wide imports
//     wire endpoint, so the frontend can't reconstruct them. Imports
//     changing in isolation is a known blind spot for the gating signal.
type snapshotShape struct {
	Resources []snapshotResource `json:"resources"`
	Routes    []snapshotRoute    `json:"routes"`
	Variables []snapshotVariable `json:"variables"`
}

type snapshotResource struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Spec      any    `json:"spec"`
	UpdatedAt int64  `json:"updatedAt"`
}

type snapshotRoute struct {
	ID         string `json:"id"`
	ResourceID string `json:"resourceId"`
	Domain     string `json:"domain"`
	Path       string `json:"path"`
	PathType   string `json:"pathType"`
	Port       int32  `json:"port"`
	TLS        bool   `json:"tls"`
	Config     any    `json:"config"`
	UpdatedAt  int64  `json:"updatedAt"`
}

type snapshotVariable struct {
	ID         string  `json:"id"`
	ResourceID *string `json:"resourceId"`
	Key        string  `json:"key"`
	Secret     bool    `json:"secret"`
	Value      string  `json:"value"`
	UpdatedAt  int64   `json:"updatedAt"`
}

// buildSnapshot loads env-scoped state and renders the canonical shape.
// Stored in the deployment row's `snapshot` JSONB column.
func (s *Service) buildSnapshot(ctx context.Context, projectID, envID uuid.UUID) ([]byte, error) {
	pid := pgxid.PgUUID(projectID)
	eid := pgxid.PgUUID(envID)

	resources, err := s.db.Q.ListResourcesByProject(ctx, pid)
	if err != nil {
		return nil, err
	}
	routes, err := s.db.Q.ListRoutesByProjectEnv(ctx, sqlc.ListRoutesByProjectEnvParams{
		ProjectID:     pid,
		EnvironmentID: eid,
	})
	if err != nil {
		return nil, err
	}
	variables, err := s.db.Q.ListVariablesByProjectEnv(ctx, sqlc.ListVariablesByProjectEnvParams{
		ProjectID:     pid,
		EnvironmentID: eid,
	})
	if err != nil {
		return nil, err
	}

	out := snapshotShape{
		Resources: make([]snapshotResource, 0, len(resources)),
		Routes:    make([]snapshotRoute, 0, len(routes)),
		Variables: make([]snapshotVariable, 0, len(variables)),
	}

	for _, r := range resources {
		spec := parseJSONOrEmpty(r.Spec)
		out.Resources = append(out.Resources, snapshotResource{
			ID:        uuid.UUID(r.ID.Bytes).String(),
			Name:      r.Name,
			Kind:      r.Kind,
			Spec:      spec,
			UpdatedAt: r.Updated.Time.UnixMilli(),
		})
	}
	sort.Slice(out.Resources, func(i, j int) bool { return out.Resources[i].ID < out.Resources[j].ID })

	for _, rt := range routes {
		cfg := parseJSONOrEmpty(rt.Config)
		out.Routes = append(out.Routes, snapshotRoute{
			ID:         uuid.UUID(rt.ID.Bytes).String(),
			ResourceID: uuid.UUID(rt.ResourceID.Bytes).String(),
			Domain:     rt.Domain,
			Path:       rt.Path,
			PathType:   string(rt.PathType),
			Port:       rt.Port,
			TLS:        rt.Tls,
			Config:     cfg,
			UpdatedAt:  rt.Updated.Time.UnixMilli(),
		})
	}
	sort.Slice(out.Routes, func(i, j int) bool { return out.Routes[i].ID < out.Routes[j].ID })

	for _, v := range variables {
		secret := v.Secret != nil && *v.Secret
		var value string
		if !secret && v.Value != nil {
			value = *v.Value
		}
		var rid *string
		if v.ResourceID.Valid {
			s := uuid.UUID(v.ResourceID.Bytes).String()
			rid = &s
		}
		out.Variables = append(out.Variables, snapshotVariable{
			ID:         uuid.UUID(v.ID.Bytes).String(),
			ResourceID: rid,
			Key:        v.Key,
			Secret:     secret,
			Value:      value,
			UpdatedAt:  v.Updated.Time.UnixMilli(),
		})
	}
	sort.Slice(out.Variables, func(i, j int) bool { return out.Variables[i].ID < out.Variables[j].ID })

	return json.Marshal(out)
}

// parseJSONOrEmpty unmarshals raw JSON bytes into a generic value, returning
// an empty object if the input is empty/null. Storing parsed (not raw) form
// in the snapshot gives Go's encoder a chance to canonical-sort map keys.
func parseJSONOrEmpty(raw []byte) any {
	if len(raw) == 0 {
		return map[string]any{}
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return map[string]any{}
	}
	if v == nil {
		return map[string]any{}
	}
	return v
}
