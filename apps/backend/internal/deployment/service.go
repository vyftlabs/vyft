// Package deployment owns business logic for deployments.
package deployment

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
)

type Service struct {
	db *db.DB
	rt Runtime
}

func New(d *db.DB, rt Runtime) *Service { return &Service{db: d, rt: rt} }

// statusUpdater is the Service-internal StatusUpdater handed to Runtime.Apply.
// Lives on the Service so it can use the same *db.DB.
type statusUpdater struct{ db *db.DB }

func (u *statusUpdater) MarkApplying(ctx context.Context, id uuid.UUID) error {
	_, err := u.db.Q.UpdateDeploymentStatus(ctx, sqlc.UpdateDeploymentStatusParams{
		ID:            pgxid.PgUUID(id),
		Status:        sqlc.DeploymentStatusApplying,
		StatusMessage: nil,
	})
	return err
}

func (u *statusUpdater) MarkApplied(ctx context.Context, id uuid.UUID) error {
	_, err := u.db.Q.MarkDeploymentApplied(ctx, pgxid.PgUUID(id))
	return err
}

func (u *statusUpdater) MarkFailed(ctx context.Context, id uuid.UUID, reason string) error {
	_, err := u.db.Q.MarkDeploymentFailed(ctx, sqlc.MarkDeploymentFailedParams{
		ID:            pgxid.PgUUID(id),
		StatusMessage: &reason,
	})
	return err
}

func (s *Service) Checksum(ctx context.Context, projectID uuid.UUID) (openapi.DeploymentChecksum, error) {
	rs, err := s.db.Q.ListResourcesByProject(ctx, pgxid.PgUUID(projectID))
	if err != nil {
		return openapi.DeploymentChecksum{}, apierr.Internal(err)
	}
	if len(rs) == 0 {
		return openapi.DeploymentChecksum{Checksum: nil}, nil
	}
	_, sum, err := s.snapshot(ctx, projectID)
	if err != nil {
		return openapi.DeploymentChecksum{}, apierr.Internal(err)
	}
	return openapi.DeploymentChecksum{Checksum: &sum}, nil
}

func (s *Service) Latest(ctx context.Context, projectID uuid.UUID) (*openapi.DeploymentLatest, error) {
	d, err := s.db.Q.GetLatestDeployment(ctx, pgxid.PgUUID(projectID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, apierr.Internal(err)
	}
	out := openapi.DeploymentLatest{
		Checksum:  d.Checksum,
		Status:    openapi.DeploymentLatestStatus(d.Status),
		CreatedAt: d.Created.Time,
	}
	return &out, nil
}

func (s *Service) Create(ctx context.Context, projectID uuid.UUID) (openapi.Deployment, error) {
	payload, sum, err := s.snapshot(ctx, projectID)
	if err != nil {
		return openapi.Deployment{}, apierr.Internal(err)
	}
	d, err := s.db.Q.CreateDeployment(ctx, sqlc.CreateDeploymentParams{
		ID:            pgxid.PgUUID(uuid.New()),
		ProjectID:     pgxid.PgUUID(projectID),
		Status:        sqlc.DeploymentStatusPending,
		StatusMessage: nil,
		Payload:       payload,
		Checksum:      sum,
	})
	if err != nil {
		return openapi.Deployment{}, apierr.Internal(err)
	}
	// Hand off to runtime. Runtime is responsible for transitioning status.
	depID := uuid.UUID(d.ID.Bytes)
	s.rt.Apply(ctx, depID, payload, &statusUpdater{db: s.db})
	return toWire(d), nil
}

// =============================================================================
// Snapshot + checksum
// =============================================================================

func (s *Service) snapshot(ctx context.Context, projectID uuid.UUID) ([]byte, string, error) {
	pid := pgxid.PgUUID(projectID)

	resources, err := s.db.Q.ListResourcesByProject(ctx, pid)
	if err != nil {
		return nil, "", apierr.Internal(err)
	}
	routes, err := s.db.Q.ListRoutesByProject(ctx, pid)
	if err != nil {
		return nil, "", apierr.Internal(err)
	}
	vars, err := s.db.Q.ListVariablesByProject(ctx, pid)
	if err != nil {
		return nil, "", apierr.Internal(err)
	}

	type rRes struct {
		ID        string          `json:"id"`
		Name      string          `json:"name"`
		Kind      string          `json:"kind"`
		PositionX float64         `json:"positionX"`
		PositionY float64         `json:"positionY"`
		Spec      json.RawMessage `json:"spec"`
	}
	type rRoute struct {
		ID         string          `json:"id"`
		ResourceID string          `json:"resourceId"`
		Domain     string          `json:"domain"`
		Path       string          `json:"path"`
		PathType   string          `json:"pathType"`
		Port       int32           `json:"port"`
		TLS        bool            `json:"tls"`
		Config     json.RawMessage `json:"config,omitempty"`
	}
	type rVar struct {
		ID         string  `json:"id"`
		ResourceID string  `json:"resourceId,omitempty"`
		Key        string  `json:"key"`
		Value      *string `json:"value,omitempty"`
		Secret     bool    `json:"secret"`
	}
	type rImport struct {
		ResourceID string `json:"resourceId"`
		Key        string `json:"key"`
		VariableID string `json:"variableId"`
	}

	wireResources := make([]rRes, len(resources))
	imports := []rImport{}
	for i, res := range resources {
		wireResources[i] = rRes{
			ID:        uuid.UUID(res.ID.Bytes).String(),
			Name:      res.Name,
			Kind:      res.Kind,
			PositionX: res.PositionX,
			PositionY: res.PositionY,
			Spec:      res.Spec,
		}
		imps, err := s.db.Q.ListResourceImports(ctx, res.ID)
		if err != nil {
			return nil, "", apierr.Internal(err)
		}
		for _, imp := range imps {
			imports = append(imports, rImport{
				ResourceID: uuid.UUID(imp.ResourceID.Bytes).String(),
				Key:        imp.Key,
				VariableID: uuid.UUID(imp.VariableID.Bytes).String(),
			})
		}
	}
	wireRoutes := make([]rRoute, len(routes))
	for i, rt := range routes {
		wireRoutes[i] = rRoute{
			ID:         uuid.UUID(rt.ID.Bytes).String(),
			ResourceID: uuid.UUID(rt.ResourceID.Bytes).String(),
			Domain:     rt.Domain,
			Path:       rt.Path,
			PathType:   string(rt.PathType),
			Port:       rt.Port,
			TLS:        rt.Tls,
			Config:     rt.Config,
		}
	}
	wireVars := make([]rVar, len(vars))
	for i, v := range vars {
		secret := v.Secret != nil && *v.Secret
		var val *string
		if !secret {
			val = v.Value
		}
		wireVars[i] = rVar{
			ID:         uuid.UUID(v.ID.Bytes).String(),
			ResourceID: uuid.UUID(v.ResourceID.Bytes).String(),
			Key:        v.Key,
			Value:      val,
			Secret:     secret,
		}
	}

	payload := map[string]any{
		"resources": wireResources,
		"routes":    wireRoutes,
		"variables": wireVars,
		"imports":   imports,
	}
	bytes, err := json.Marshal(payload)
	if err != nil {
		return nil, "", apierr.Internal(err)
	}
	hash := sha256.Sum256(bytes)
	return bytes, hex.EncodeToString(hash[:]), nil
}
