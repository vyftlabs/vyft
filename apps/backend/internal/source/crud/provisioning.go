package crud

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/google/uuid"
	"sigs.k8s.io/yaml"

	"github.com/vyftlabs/vyft/apps/backend/internal/db"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/pgxid"
)

// DefaultProvisioningDir is the cwd-relative default. Backend deploys
// run from a directory with etc/ alongside; dev sets the env override
// to point at the repo-root etc/.
const DefaultProvisioningDir = "etc/vyft/provisioning"

// ProvisioningEnv overrides DefaultProvisioningDir. Set to an absolute
// or relative path to the provisioning root (the dir containing
// sources/).
const ProvisioningEnv = "VYFT_PROVISIONING_DIR"

// ResolveProvisioningDir returns $VYFT_PROVISIONING_DIR if set,
// otherwise DefaultProvisioningDir. The caller's load step decides what
// to do when the dir doesn't exist (current behavior: skip silently).
func ResolveProvisioningDir() string {
	if v := strings.TrimSpace(os.Getenv(ProvisioningEnv)); v != "" {
		return v
	}
	return DefaultProvisioningDir
}

// provisionedNamespace seeds UUIDv5 generation for provisioned source IDs.
// Stable across restarts so a name keeps the same ID. Random uuid chosen
// once for this purpose — do not change.
var provisionedNamespace = uuid.MustParse("3b5c7ab8-2bf9-4f24-9c2c-9b7c0d2c3a4f")

// provisionedFile is the on-disk YAML schema for one provisioning file.
// Files live in <dir>/sources/*.{yaml,yml}; each holds a list of source
// entries. Schema mirrors openapi.SourceCreate so the CRUD parser can
// reuse parseCreate after a JSON round-trip.
type provisionedFile struct {
	APIVersion string              `json:"apiVersion,omitempty"`
	Sources    []provisionedSource `json:"sources"`
}

type provisionedSource struct {
	Name   string          `json:"name"`
	Kind   string          `json:"kind"`
	Domain string          `json:"domain"`
	Config json.RawMessage `json:"config"`
}

// SyncProvisioning loads every YAML file under <dir>/sources/, upserts
// each entry as provisioned=true, and deletes provisioned rows whose
// names are absent from the current snapshot. Missing dir is a no-op so
// fresh installs don't fail.
func SyncProvisioning(ctx context.Context, database *db.DB, dir string) error {
	specs, err := loadProvisioning(dir)
	if err != nil {
		return err
	}
	names := make([]string, 0, len(specs))
	for _, s := range specs {
		row, err := upsertProvisioned(ctx, database, s)
		if err != nil {
			return fmt.Errorf("upsert %q: %w", s.name, err)
		}
		names = append(names, row.Name)
	}
	if err := database.Q.DeleteProvisionedSourcesNotIn(ctx, names); err != nil {
		return fmt.Errorf("prune provisioned: %w", err)
	}
	return nil
}

// loadProvisioning reads <dir>/sources/*.{yaml,yml}, decodes each into
// parsedCreate values, and validates name uniqueness across files. The
// returned slice is sorted by name for stable ordering.
func loadProvisioning(dir string) ([]parsedCreate, error) {
	root := filepath.Join(dir, "sources")
	entries, err := os.ReadDir(root)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read %s: %w", root, err)
	}
	seen := map[string]string{}
	var out []parsedCreate
	for _, e := range entries {
		if e.IsDir() || !isYAML(e.Name()) {
			continue
		}
		path := filepath.Join(root, e.Name())
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", path, err)
		}
		var doc provisionedFile
		if err := yaml.Unmarshal(raw, &doc); err != nil {
			return nil, fmt.Errorf("parse %s: %w", path, err)
		}
		for i, entry := range doc.Sources {
			parsed, err := provisionedToParsed(entry)
			if err != nil {
				return nil, fmt.Errorf("%s entry %d: %w", path, i, err)
			}
			if prev, ok := seen[parsed.name]; ok {
				return nil, fmt.Errorf("duplicate provisioned source name %q in %s (also in %s)", parsed.name, path, prev)
			}
			seen[parsed.name] = path
			out = append(out, parsed)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].name < out[j].name })
	return out, nil
}

func upsertProvisioned(ctx context.Context, database *db.DB, p parsedCreate) (sqlc.Source, error) {
	id := provisionedID(p.kind, p.name)
	count, err := database.Q.CountSourcesInDomain(ctx, sqlc.SourceDomain(p.domain))
	if err != nil {
		return sqlc.Source{}, err
	}
	return database.Q.UpsertProvisionedSource(ctx, sqlc.UpsertProvisionedSourceParams{
		ID:            pgxid.PgUUID(id),
		Kind:          p.kind,
		Domain:        sqlc.SourceDomain(p.domain),
		Name:          p.name,
		IsDefault:     count == 0,
		Config:        p.configJSON,
		AuthEncrypted: p.authSecret,
	})
}

// provisionedID derives a stable UUIDv5 from kind+name so a provisioned
// row keeps the same id across restarts and rename-induced upserts.
func provisionedID(kind sqlc.SourceKind, name string) uuid.UUID {
	h := sha256.Sum256([]byte(string(kind) + "|" + name))
	return uuid.NewSHA1(provisionedNamespace, h[:])
}

// provisionedToParsed funnels the YAML shape through the SourceCreate
// JSON decoder so the same validation + secret split logic runs for
// provisioned entries as for API-driven creates.
func provisionedToParsed(s provisionedSource) (parsedCreate, error) {
	if strings.TrimSpace(s.Name) == "" {
		return parsedCreate{}, errors.New("name required")
	}
	if strings.TrimSpace(s.Kind) == "" {
		return parsedCreate{}, errors.New("kind required")
	}
	if strings.TrimSpace(s.Domain) == "" {
		return parsedCreate{}, errors.New("domain required")
	}
	envelope := map[string]any{
		"name":   s.Name,
		"kind":   s.Kind,
		"domain": s.Domain,
		"config": json.RawMessage(s.Config),
	}
	body, err := json.Marshal(envelope)
	if err != nil {
		return parsedCreate{}, fmt.Errorf("marshal envelope: %w", err)
	}
	var sc openapi.SourceCreate
	if err := sc.UnmarshalJSON(body); err != nil {
		return parsedCreate{}, fmt.Errorf("decode source: %w", err)
	}
	return parseCreate(sc)
}

func isYAML(name string) bool {
	low := strings.ToLower(name)
	return strings.HasSuffix(low, ".yaml") || strings.HasSuffix(low, ".yml")
}
