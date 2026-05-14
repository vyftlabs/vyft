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
//   - reference variables (kind="reference") live in the same Variables
//     array alongside owned definitions. Adding/removing a reference flips
//     the hash even when no owned row changed. Frontend reconstructs them
//     from Variable.usedBy (each owned carries the resources referencing it).
type snapshotShape struct {
	Resources []snapshotResource `json:"resources"`
	Routes    []snapshotRoute    `json:"routes"`
	Variables []snapshotVariable `json:"variables"`
}

type snapshotResource struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Slug      string `json:"slug"`
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

// snapshotVariable is discriminated by Kind. Marshaled per-kind via custom
// MarshalJSON so the on-disk shape only contains fields relevant to that
// kind — keeps the hash stable with the frontend's discriminated union.
//
//	owned     — definition row. Has id, key, value/secret, updatedAt. Lives
//	            either project-wide (ResourceID nil) or resource-scoped.
//	reference — env-binding of another variable into a resource. Has
//	            resourceId, key (local name), and sourceVariableId pointing
//	            to the owned variable being referenced.
type snapshotVariable struct {
	Kind             string
	ID               string
	ResourceID       *string
	Key              string
	Secret           bool
	Value            string
	UpdatedAt        int64
	SourceVariableID string
}

func (v snapshotVariable) MarshalJSON() ([]byte, error) {
	if v.Kind == "reference" {
		return json.Marshal(struct {
			Kind             string `json:"kind"`
			ResourceID       string `json:"resourceId"`
			Key              string `json:"key"`
			SourceVariableID string `json:"sourceVariableId"`
		}{"reference", derefStr(v.ResourceID), v.Key, v.SourceVariableID})
	}
	return json.Marshal(struct {
		Kind       string  `json:"kind"`
		ID         string  `json:"id"`
		ResourceID *string `json:"resourceId"`
		Key        string  `json:"key"`
		Secret     bool    `json:"secret"`
		Value      string  `json:"value"`
		UpdatedAt  int64   `json:"updatedAt"`
	}{"owned", v.ID, v.ResourceID, v.Key, v.Secret, v.Value, v.UpdatedAt})
}

func (v *snapshotVariable) UnmarshalJSON(b []byte) error {
	var probe struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(b, &probe); err != nil {
		return err
	}
	if probe.Kind == "reference" {
		var r struct {
			Kind             string `json:"kind"`
			ResourceID       string `json:"resourceId"`
			Key              string `json:"key"`
			SourceVariableID string `json:"sourceVariableId"`
		}
		if err := json.Unmarshal(b, &r); err != nil {
			return err
		}
		rid := r.ResourceID
		*v = snapshotVariable{Kind: "reference", ResourceID: &rid, Key: r.Key, SourceVariableID: r.SourceVariableID}
		return nil
	}
	var o struct {
		Kind       string  `json:"kind"`
		ID         string  `json:"id"`
		ResourceID *string `json:"resourceId"`
		Key        string  `json:"key"`
		Secret     bool    `json:"secret"`
		Value      string  `json:"value"`
		UpdatedAt  int64   `json:"updatedAt"`
	}
	if err := json.Unmarshal(b, &o); err != nil {
		return err
	}
	*v = snapshotVariable{Kind: "owned", ID: o.ID, ResourceID: o.ResourceID, Key: o.Key, Secret: o.Secret, Value: o.Value, UpdatedAt: o.UpdatedAt}
	return nil
}

// buildSnapshot loads env-scoped state and renders the canonical shape.
// Stored in the deployment row's `snapshot` JSONB column.
func (s *Service) buildSnapshot(ctx context.Context, projectID, envID uuid.UUID) ([]byte, error) {
	return buildSnapshotWith(ctx, s.db.Q, projectID, envID)
}

// buildSnapshotWith is the tx-aware variant used inside WithTx callbacks
// that need to snapshot the post-write state.
func buildSnapshotWith(ctx context.Context, q *sqlc.Queries, projectID, envID uuid.UUID) ([]byte, error) {
	pid := pgxid.PgUUID(projectID)
	eid := pgxid.PgUUID(envID)

	resources, err := q.ListResourcesByProject(ctx, pid)
	if err != nil {
		return nil, err
	}
	routes, err := q.ListRoutesByProjectEnv(ctx, sqlc.ListRoutesByProjectEnvParams{
		ProjectID:     pid,
		EnvironmentID: eid,
	})
	if err != nil {
		return nil, err
	}
	variables, err := q.ListVariablesByProjectEnv(ctx, sqlc.ListVariablesByProjectEnvParams{
		ProjectID:     pid,
		EnvironmentID: eid,
	})
	if err != nil {
		return nil, err
	}
	imports, err := q.ListResourceImportsByEnv(ctx, sqlc.ListResourceImportsByEnvParams{
		ProjectID:     pid,
		EnvironmentID: eid,
	})
	if err != nil {
		return nil, err
	}

	out := snapshotShape{
		Resources: make([]snapshotResource, 0, len(resources)),
		Routes:    make([]snapshotRoute, 0, len(routes)),
		Variables: make([]snapshotVariable, 0, len(variables)+len(imports)),
	}

	for _, r := range resources {
		spec := parseJSONOrEmpty(r.Spec)
		out.Resources = append(out.Resources, snapshotResource{
			ID:        uuid.UUID(r.ID.Bytes).String(),
			Name:      r.Name,
			Slug:      r.Slug,
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
			Kind:       "owned",
			ID:         uuid.UUID(v.ID.Bytes).String(),
			ResourceID: rid,
			Key:        v.Key,
			Secret:     secret,
			Value:      value,
			UpdatedAt:  v.Updated.Time.UnixMilli(),
		})
	}
	for _, imp := range imports {
		rid := uuid.UUID(imp.ResourceID.Bytes).String()
		out.Variables = append(out.Variables, snapshotVariable{
			Kind:             "reference",
			ResourceID:       &rid,
			Key:              imp.Key,
			SourceVariableID: uuid.UUID(imp.VariableID.Bytes).String(),
		})
	}
	sort.Slice(out.Variables, func(i, j int) bool {
		a, b := out.Variables[i], out.Variables[j]
		if a.Kind != b.Kind {
			return a.Kind < b.Kind
		}
		// owned: sort by id (always set); reference: sort by (resourceId, key).
		if a.Kind == "owned" {
			return a.ID < b.ID
		}
		if ridA, ridB := derefStr(a.ResourceID), derefStr(b.ResourceID); ridA != ridB {
			return ridA < ridB
		}
		return a.Key < b.Key
	})

	return json.Marshal(out)
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// filterByResourceChanges walks the given deployments newest→oldest and
// keeps those whose snapshot slice for the resource differs from the
// next-older deployment's slice. Rows must already be ordered newest→
// oldest (as returned by List).
func filterByResourceChanges(rows []sqlc.Deployment, resourceID uuid.UUID) ([]sqlc.Deployment, error) {
	if len(rows) == 0 {
		return nil, nil
	}
	rid := resourceID.String()
	slices := make([]string, len(rows))
	for i, r := range rows {
		s, err := resourceSlice(r.Snapshot, rid)
		if err != nil {
			return nil, err
		}
		slices[i] = s
	}
	out := make([]sqlc.Deployment, 0, len(rows))
	for i, r := range rows {
		// Compare against the next-older deployment. The oldest row has
		// no predecessor — treat empty as the baseline so "service first
		// appears" still counts as a change.
		var prev string
		if i+1 < len(rows) {
			prev = slices[i+1]
		}
		if slices[i] != prev {
			out = append(out, r)
		}
	}
	return out, nil
}

// resourceSlice canonical-stringifies the subset of the snapshot that
// belongs to a single resource: its own resource entry + routes/variables
// whose resourceId matches. Returns "" for empty snapshots.
func resourceSlice(raw []byte, rid string) (string, error) {
	if len(raw) == 0 {
		return "", nil
	}
	var snap snapshotShape
	if err := json.Unmarshal(raw, &snap); err != nil {
		return "", err
	}
	out := snapshotShape{}
	for _, r := range snap.Resources {
		if r.ID == rid {
			out.Resources = append(out.Resources, r)
		}
	}
	for _, rt := range snap.Routes {
		if rt.ResourceID == rid {
			out.Routes = append(out.Routes, rt)
		}
	}
	for _, v := range snap.Variables {
		// Both kinds: owned-by-resource and reference rows are scoped via
		// ResourceID. Shared owned vars (ResourceID nil) belong to the
		// project, not any single resource — excluded from per-resource slice.
		if v.ResourceID != nil && *v.ResourceID == rid {
			out.Variables = append(out.Variables, v)
		}
	}
	// Resource absent from this deployment — match the empty-snapshot sentinel
	// so filterByResourceChanges treats "didn't exist" the same as "no rows".
	if len(out.Resources) == 0 && len(out.Routes) == 0 && len(out.Variables) == 0 {
		return "", nil
	}
	bytes, err := json.Marshal(out)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
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
