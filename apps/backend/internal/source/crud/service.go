// Package crud serves the source CRUD endpoints. Lives in its own
// package so it can import the prometheus subpkg without forming an
// import cycle with the parent source interface package.
package crud

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"

	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgerr"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
	"github.com/vyftlabs/vyft/apps/backend/internal/source/loki"
	"github.com/vyftlabs/vyft/apps/backend/internal/source/prometheus"
)

// Service owns source CRUD business logic. Stateless beyond the DB
// handle. cs and mcs are optional — nil when the corresponding kube
// client could not be built; affected source kinds report unreachable
// in their Test result.
type Service struct {
	db  *db.DB
	cs  kubernetes.Interface
	mcs metricsclient.Interface
}

func NewService(d *db.DB, cs kubernetes.Interface, mcs metricsclient.Interface) *Service {
	return &Service{db: d, cs: cs, mcs: mcs}
}

func (s *Service) List(ctx context.Context) ([]sqlc.Source, error) {
	rows, err := s.db.Q.ListSources(ctx)
	if err != nil {
		return nil, apierr.Internal(err)
	}
	return rows, nil
}

func (s *Service) Create(ctx context.Context, body openapi.SourceCreate) (sqlc.Source, error) {
	parsed, err := parseCreate(body)
	if err != nil {
		return sqlc.Source{}, apierr.BadRequest(err.Error())
	}
	if parsed.name == "" {
		return sqlc.Source{}, apierr.BadRequest("name required")
	}
	count, err := s.db.Q.CountSourcesInDomain(ctx, sqlc.SourceDomain(parsed.domain))
	if err != nil {
		return sqlc.Source{}, apierr.Internal(err)
	}
	row, err := s.db.Q.CreateSource(ctx, sqlc.CreateSourceParams{
		ID:            pgxid.PgUUID(uuid.New()),
		Kind:          parsed.kind,
		Domain:        sqlc.SourceDomain(parsed.domain),
		Name:          parsed.name,
		IsDefault:     count == 0,
		Config:        parsed.configJSON,
		AuthEncrypted: parsed.authSecret,
	})
	if err != nil {
		if pgerr.IsUniqueViolation(err) {
			return sqlc.Source{}, apierr.Conflict("source name already exists")
		}
		return sqlc.Source{}, apierr.Internal(err)
	}
	return row, nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, body openapi.SourceCreate) (sqlc.Source, error) {
	existing, err := s.db.Q.GetSource(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Source{}, apierr.NotFound("source not found")
		}
		return sqlc.Source{}, apierr.Internal(err)
	}
	parsed, err := parseCreate(body)
	if err != nil {
		return sqlc.Source{}, apierr.BadRequest(err.Error())
	}
	if parsed.kind != existing.Kind {
		return sqlc.Source{}, apierr.BadRequest("kind cannot change; delete and recreate")
	}
	if sqlc.SourceDomain(parsed.domain) != existing.Domain {
		return sqlc.Source{}, apierr.BadRequest("domain cannot change; delete and recreate")
	}
	if parsed.name == "" {
		return sqlc.Source{}, apierr.BadRequest("name required")
	}
	// Preserve existing auth bytes when PATCH body sends an empty secret —
	// the UI shows password/token as "(unchanged)" placeholder and leaves
	// the field blank to mean "keep what's stored". Replace only when the
	// operator types something new.
	authBytes := parsed.authSecret
	if len(authBytes) == 0 {
		authBytes = existing.AuthEncrypted
	}
	row, err := s.db.Q.UpdateSource(ctx, sqlc.UpdateSourceParams{
		ID:            pgxid.PgUUID(id),
		Name:          parsed.name,
		Config:        parsed.configJSON,
		AuthEncrypted: authBytes,
	})
	if err != nil {
		if pgerr.IsUniqueViolation(err) {
			return sqlc.Source{}, apierr.Conflict("source name already exists")
		}
		return sqlc.Source{}, apierr.Internal(err)
	}
	return row, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	if _, err := s.db.Q.GetSource(ctx, pgxid.PgUUID(id)); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.NotFound("source not found")
		}
		return apierr.Internal(err)
	}
	if err := s.db.Q.DeleteSource(ctx, pgxid.PgUUID(id)); err != nil {
		return apierr.Internal(err)
	}
	return nil
}

// TestResult is the outcome of probing a source for reachability.
type TestResult struct {
	OK    bool
	Error string
}

// Test probes the supplied (pending) source config for reachability —
// not the DB row. For Prometheus, runs a trivial `up` instant query.
// For metrics-server, lists 1 PodMetrics in the default namespace.
// Returns TestResult{OK: false, Error: msg} on probe failure so the
// caller can render the error without treating it as a server error.
func (s *Service) Test(ctx context.Context, body openapi.SourceCreate) (TestResult, error) {
	parsed, err := parseCreate(body)
	if err != nil {
		return TestResult{}, apierr.BadRequest(err.Error())
	}
	switch parsed.kind {
	case sqlc.SourceKindPrometheus:
		return testPrometheusConfig(ctx, parsed)
	case sqlc.SourceKindMetricsServer:
		return testMetricsServer(ctx, s.mcs)
	case sqlc.SourceKindLoki:
		return testLokiConfig(ctx, parsed)
	case sqlc.SourceKindKubeLogs:
		return testKubeLogs(ctx, s.cs)
	}
	return TestResult{}, apierr.Internal(fmt.Errorf("unknown source kind %q", parsed.kind))
}

func (s *Service) PromoteDefault(ctx context.Context, id uuid.UUID) (sqlc.Source, error) {
	row, err := s.db.Q.GetSource(ctx, pgxid.PgUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Source{}, apierr.NotFound("source not found")
		}
		return sqlc.Source{}, apierr.Internal(err)
	}
	// Clear the existing default, then mark the target — in one
	// transaction. A single multi-row UPDATE would trip the partial
	// unique index on (domain) WHERE is_default = true because the
	// constraint is checked per-row, not at statement end.
	err = s.db.WithTx(ctx, func(q *sqlc.Queries) error {
		if err := q.ClearDefaultSource(ctx, sqlc.ClearDefaultSourceParams{
			Domain: row.Domain,
			ID:     row.ID,
		}); err != nil {
			return err
		}
		return q.SetDefaultTrue(ctx, row.ID)
	})
	if err != nil {
		return sqlc.Source{}, apierr.Internal(err)
	}
	out, err := s.db.Q.GetSource(ctx, row.ID)
	if err != nil {
		return sqlc.Source{}, apierr.Internal(err)
	}
	return out, nil
}

// parsedCreate is the post-validation flat view of a SourceCreate request
// body. Secrets are extracted from the config blob so they can be stored
// in auth_encrypted; non-secret config stays in jsonb.
type parsedCreate struct {
	kind       sqlc.SourceKind
	domain     openapi.SourceDomain
	name       string
	configJSON []byte
	authSecret []byte // nil for none / metrics-server
}

func parseCreate(body openapi.SourceCreate) (parsedCreate, error) {
	raw, err := body.MarshalJSON()
	if err != nil {
		return parsedCreate{}, fmt.Errorf("decode body: %w", err)
	}
	var probe struct {
		Kind openapi.SourceKind `json:"kind"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return parsedCreate{}, fmt.Errorf("decode kind: %w", err)
	}
	switch probe.Kind {
	case openapi.Prometheus:
		v, err := body.AsSourceCreate0()
		if err != nil {
			return parsedCreate{}, fmt.Errorf("decode prometheus body: %w", err)
		}
		stored, secret, err := splitPrometheusConfig(v.Config)
		if err != nil {
			return parsedCreate{}, err
		}
		j, err := json.Marshal(stored)
		if err != nil {
			return parsedCreate{}, err
		}
		return parsedCreate{
			kind:       sqlc.SourceKindPrometheus,
			domain:     v.Domain,
			name:       v.Name,
			configJSON: j,
			authSecret: secret,
		}, nil
	case openapi.MetricsServer:
		v, err := body.AsSourceCreate1()
		if err != nil {
			return parsedCreate{}, fmt.Errorf("decode metrics-server body: %w", err)
		}
		return parsedCreate{
			kind:       sqlc.SourceKindMetricsServer,
			domain:     v.Domain,
			name:       v.Name,
			configJSON: []byte(`{}`),
			authSecret: nil,
		}, nil
	case openapi.Loki:
		v, err := body.AsSourceCreate2()
		if err != nil {
			return parsedCreate{}, fmt.Errorf("decode loki body: %w", err)
		}
		stored, secret, err := splitLokiConfig(v.Config)
		if err != nil {
			return parsedCreate{}, err
		}
		j, err := json.Marshal(stored)
		if err != nil {
			return parsedCreate{}, err
		}
		return parsedCreate{
			kind:       sqlc.SourceKindLoki,
			domain:     v.Domain,
			name:       v.Name,
			configJSON: j,
			authSecret: secret,
		}, nil
	case openapi.KubeLogs:
		v, err := body.AsSourceCreate3()
		if err != nil {
			return parsedCreate{}, fmt.Errorf("decode kube-logs body: %w", err)
		}
		return parsedCreate{
			kind:       sqlc.SourceKindKubeLogs,
			domain:     v.Domain,
			name:       v.Name,
			configJSON: []byte(`{}`),
			authSecret: nil,
		}, nil
	}
	return parsedCreate{}, fmt.Errorf("unsupported source kind %q", probe.Kind)
}

// splitPrometheusConfig pulls password/token out of the full auth struct
// into a separate secret byte slice and returns the non-secret stored
// shape. Passthrough plaintext for v1 (matches registries.password_encrypted).
func splitPrometheusConfig(cfg openapi.PrometheusConfig) (prometheus.StoredConfig, []byte, error) {
	auth := cfg.Auth
	discriminator, err := authType(auth)
	if err != nil {
		return prometheus.StoredConfig{}, nil, err
	}
	stored := prometheus.StoredConfig{URL: cfg.Url, Auth: prometheus.StoredAuth{Type: discriminator}}
	switch discriminator {
	case prometheus.AuthNone:
		return stored, nil, nil
	case prometheus.AuthBasic:
		basic, err := auth.AsSourceAuth1()
		if err != nil {
			return prometheus.StoredConfig{}, nil, fmt.Errorf("decode basic auth: %w", err)
		}
		stored.Auth.Username = basic.Username
		return stored, []byte(basic.Password), nil
	case prometheus.AuthBearer:
		bearer, err := auth.AsSourceAuth2()
		if err != nil {
			return prometheus.StoredConfig{}, nil, fmt.Errorf("decode bearer auth: %w", err)
		}
		return stored, []byte(bearer.Token), nil
	}
	return prometheus.StoredConfig{}, nil, fmt.Errorf("unsupported auth type %q", discriminator)
}

func authType(auth openapi.SourceAuth) (prometheus.AuthType, error) {
	raw, err := auth.MarshalJSON()
	if err != nil {
		return "", fmt.Errorf("decode auth: %w", err)
	}
	var probe struct {
		Type prometheus.AuthType `json:"type"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return "", fmt.Errorf("decode auth type: %w", err)
	}
	return probe.Type, nil
}

// toWire converts a sqlc.Source row into the openapi.Source union
// response, stripping auth secrets along the way.
func toWire(row sqlc.Source) (openapi.Source, error) {
	var out openapi.Source
	id := openapi_types.UUID(uuid.UUID(row.ID.Bytes))
	domain := openapi.SourceDomain(row.Domain)
	switch row.Kind {
	case sqlc.SourceKindPrometheus:
		var stored prometheus.StoredConfig
		if err := json.Unmarshal(row.Config, &stored); err != nil {
			return openapi.Source{}, fmt.Errorf("decode prometheus config: %w", err)
		}
		safe, err := promConfigSafe(stored)
		if err != nil {
			return openapi.Source{}, err
		}
		if err := out.FromSource0(openapi.Source0{
			Id:        id,
			CreatedAt: row.Created.Time,
			UpdatedAt: row.Updated.Time,
			Kind:      openapi.Source0Kind(openapi.Prometheus),
			Domain:    domain,
			Name:      row.Name,
			IsDefault: row.IsDefault,
			Config:    safe,
		}); err != nil {
			return openapi.Source{}, err
		}
	case sqlc.SourceKindMetricsServer:
		if err := out.FromSource1(openapi.Source1{
			Id:        id,
			CreatedAt: row.Created.Time,
			UpdatedAt: row.Updated.Time,
			Kind:      openapi.Source1Kind(openapi.MetricsServer),
			Domain:    domain,
			Name:      row.Name,
			IsDefault: row.IsDefault,
			Config:    openapi.MetricsServerConfigOutput{},
		}); err != nil {
			return openapi.Source{}, err
		}
	case sqlc.SourceKindLoki:
		var stored loki.StoredConfig
		if err := json.Unmarshal(row.Config, &stored); err != nil {
			return openapi.Source{}, fmt.Errorf("decode loki config: %w", err)
		}
		safe, err := lokiConfigSafe(stored)
		if err != nil {
			return openapi.Source{}, err
		}
		if err := out.FromSource2(openapi.Source2{
			Id:        id,
			CreatedAt: row.Created.Time,
			UpdatedAt: row.Updated.Time,
			Kind:      openapi.Source2Kind(openapi.Loki),
			Domain:    domain,
			Name:      row.Name,
			IsDefault: row.IsDefault,
			Config:    safe,
		}); err != nil {
			return openapi.Source{}, err
		}
	case sqlc.SourceKindKubeLogs:
		if err := out.FromSource3(openapi.Source3{
			Id:        id,
			CreatedAt: row.Created.Time,
			UpdatedAt: row.Updated.Time,
			Kind:      openapi.Source3Kind(openapi.KubeLogs),
			Domain:    domain,
			Name:      row.Name,
			IsDefault: row.IsDefault,
			Config:    openapi.KubeLogsConfigOutput{},
		}); err != nil {
			return openapi.Source{}, err
		}
	default:
		return openapi.Source{}, fmt.Errorf("unknown source kind %q", row.Kind)
	}
	return out, nil
}

// splitLokiConfig mirrors splitPrometheusConfig — pulls password/token
// into the secret byte slice and returns the non-secret stored shape.
func splitLokiConfig(cfg openapi.LokiConfig) (loki.StoredConfig, []byte, error) {
	auth := cfg.Auth
	discriminator, err := authType(auth)
	if err != nil {
		return loki.StoredConfig{}, nil, err
	}
	stored := loki.StoredConfig{URL: cfg.Url, Auth: loki.StoredAuth{Type: loki.AuthType(discriminator)}}
	switch loki.AuthType(discriminator) {
	case loki.AuthNone:
		return stored, nil, nil
	case loki.AuthBasic:
		basic, err := auth.AsSourceAuth1()
		if err != nil {
			return loki.StoredConfig{}, nil, fmt.Errorf("decode basic auth: %w", err)
		}
		stored.Auth.Username = basic.Username
		return stored, []byte(basic.Password), nil
	case loki.AuthBearer:
		bearer, err := auth.AsSourceAuth2()
		if err != nil {
			return loki.StoredConfig{}, nil, fmt.Errorf("decode bearer auth: %w", err)
		}
		return stored, []byte(bearer.Token), nil
	}
	return loki.StoredConfig{}, nil, fmt.Errorf("unsupported auth type %q", discriminator)
}

func lokiConfigSafe(stored loki.StoredConfig) (openapi.LokiConfigSafe, error) {
	var safe openapi.LokiConfigSafe
	safe.Url = stored.URL
	var authUnion openapi.SourceAuthSafe
	switch stored.Auth.Type {
	case loki.AuthNone, "":
		if err := authUnion.FromSourceAuthSafe0(openapi.SourceAuthSafe0{
			Type: openapi.SourceAuthSafe0Type("none"),
		}); err != nil {
			return openapi.LokiConfigSafe{}, err
		}
	case loki.AuthBasic:
		if err := authUnion.FromSourceAuthSafe1(openapi.SourceAuthSafe1{
			Type:     openapi.SourceAuthSafe1Type("basic"),
			Username: stored.Auth.Username,
		}); err != nil {
			return openapi.LokiConfigSafe{}, err
		}
	case loki.AuthBearer:
		if err := authUnion.FromSourceAuthSafe2(openapi.SourceAuthSafe2{
			Type: openapi.SourceAuthSafe2Type("bearer"),
		}); err != nil {
			return openapi.LokiConfigSafe{}, err
		}
	default:
		return openapi.LokiConfigSafe{}, fmt.Errorf("unknown auth type %q", stored.Auth.Type)
	}
	safe.Auth = authUnion
	return safe, nil
}

func promConfigSafe(stored prometheus.StoredConfig) (openapi.PrometheusConfigSafe, error) {
	var safe openapi.PrometheusConfigSafe
	safe.Url = stored.URL
	var authUnion openapi.SourceAuthSafe
	switch stored.Auth.Type {
	case prometheus.AuthNone, "":
		if err := authUnion.FromSourceAuthSafe0(openapi.SourceAuthSafe0{
			Type: openapi.SourceAuthSafe0Type("none"),
		}); err != nil {
			return openapi.PrometheusConfigSafe{}, err
		}
	case prometheus.AuthBasic:
		if err := authUnion.FromSourceAuthSafe1(openapi.SourceAuthSafe1{
			Type:     openapi.SourceAuthSafe1Type("basic"),
			Username: stored.Auth.Username,
		}); err != nil {
			return openapi.PrometheusConfigSafe{}, err
		}
	case prometheus.AuthBearer:
		if err := authUnion.FromSourceAuthSafe2(openapi.SourceAuthSafe2{
			Type: openapi.SourceAuthSafe2Type("bearer"),
		}); err != nil {
			return openapi.PrometheusConfigSafe{}, err
		}
	default:
		return openapi.PrometheusConfigSafe{}, fmt.Errorf("unknown auth type %q", stored.Auth.Type)
	}
	safe.Auth = authUnion
	return safe, nil
}

// unused so far; reserved for future helpers
var _ pgtype.UUID

// testPrometheusConfig builds an ephemeral Prom client from the parsed
// request body (no DB lookup) and probes it.
func testPrometheusConfig(ctx context.Context, p parsedCreate) (TestResult, error) {
	var stored prometheus.StoredConfig
	if err := json.Unmarshal(p.configJSON, &stored); err != nil {
		return TestResult{}, apierr.Internal(fmt.Errorf("decode config: %w", err))
	}
	src, err := stored.Build(uuid.New(), p.name, p.authSecret)
	if err != nil {
		return TestResult{OK: false, Error: err.Error()}, nil
	}
	probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := src.Probe(probeCtx, []string{"up"}); err != nil {
		return TestResult{OK: false, Error: err.Error()}, nil
	}
	return TestResult{OK: true}, nil
}

func testLokiConfig(ctx context.Context, p parsedCreate) (TestResult, error) {
	var stored loki.StoredConfig
	if err := json.Unmarshal(p.configJSON, &stored); err != nil {
		return TestResult{}, apierr.Internal(fmt.Errorf("decode config: %w", err))
	}
	src, err := stored.Build(uuid.New(), p.name, p.authSecret)
	if err != nil {
		return TestResult{OK: false, Error: err.Error()}, nil
	}
	probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := src.Probe(probeCtx); err != nil {
		return TestResult{OK: false, Error: err.Error()}, nil
	}
	return TestResult{OK: true}, nil
}

func testKubeLogs(ctx context.Context, cs kubernetes.Interface) (TestResult, error) {
	if cs == nil {
		return TestResult{OK: false, Error: "kube client not available on backend"}, nil
	}
	probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := cs.Discovery().ServerVersion(); err != nil {
		_ = probeCtx
		return TestResult{OK: false, Error: err.Error()}, nil
	}
	return TestResult{OK: true}, nil
}

func testMetricsServer(ctx context.Context, mcs metricsclient.Interface) (TestResult, error) {
	if mcs == nil {
		return TestResult{OK: false, Error: "metrics-server client not available on backend"}, nil
	}
	probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := mcs.MetricsV1beta1().PodMetricses("default").List(probeCtx, metav1.ListOptions{Limit: 1}); err != nil {
		return TestResult{OK: false, Error: err.Error()}, nil
	}
	return TestResult{OK: true}, nil
}
