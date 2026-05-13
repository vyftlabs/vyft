// Package resolver builds typed source.Source values from the
// `source_defaults` + `sources` rows that flag the active backend for a
// domain. Lives in its own package to avoid an import cycle between
// `source` and its impl sub-packages.
package resolver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"

	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/source"
	"github.com/vyftlabs/vyft/apps/backend/internal/source/metricsserver"
	"github.com/vyftlabs/vyft/apps/backend/internal/source/prometheus"
)

// Domain is the per-vertical key in the source_defaults table. v1 only
// has "metrics"; logs and traces land later.
type Domain string

const DomainMetrics Domain = "metrics"

// Resolver builds a typed Source from the DB row flagged as the default
// for a given domain. Reads DB every call — no caching v1.
type Resolver struct {
	db  *db.DB
	mcs metricsclient.Interface
}

func New(d *db.DB, mcs metricsclient.Interface) *Resolver {
	return &Resolver{db: d, mcs: mcs}
}

// Resolve returns the active source for a domain (the row flagged
// is_default=true), or (nil, nil) when none is configured. Errors only on
// DB/decode failure.
func (r *Resolver) Resolve(ctx context.Context, domain Domain) (source.Source, error) {
	row, err := r.db.Q.GetDefaultSource(ctx, sqlc.SourceDomain(domain))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("resolver: get default %s: %w", domain, err)
	}
	return r.build(row)
}

// ResolveMetrics resolves the metrics domain and asserts the result
// implements MetricsCapable. Returns (nil, nil) when no default is set.
func (r *Resolver) ResolveMetrics(ctx context.Context) (source.MetricsCapable, error) {
	s, err := r.Resolve(ctx, DomainMetrics)
	if err != nil || s == nil {
		return nil, err
	}
	mc, ok := s.(source.MetricsCapable)
	if !ok {
		return nil, fmt.Errorf("resolver: source kind %q is not metrics-capable", s.Kind())
	}
	return mc, nil
}

func (r *Resolver) build(row sqlc.Source) (source.Source, error) {
	id := uuid.UUID(row.ID.Bytes)
	switch row.Kind {
	case sqlc.SourceKindPrometheus:
		var cfg prometheus.StoredConfig
		if err := json.Unmarshal(row.Config, &cfg); err != nil {
			return nil, fmt.Errorf("resolver: prometheus config: %w", err)
		}
		// auth_encrypted is plaintext-passthrough for v1; same TODO as
		// registries.password_encrypted.
		return cfg.Build(id, row.Name, row.AuthEncrypted)
	case sqlc.SourceKindMetricsServer:
		return metricsserver.New(id, row.Name, r.mcs), nil
	}
	return nil, fmt.Errorf("resolver: unknown source kind %q", row.Kind)
}
