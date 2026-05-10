package k8s

import (
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
	"sigs.k8s.io/yaml"

	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
)

// update overrides golden files when set with -update. CI runs without it.
var update = flag.Bool("update", false, "update golden files")

func TestBuild_AppGolden(t *testing.T) {
	resID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	port := int32(8080)
	memMB := int64(512)
	specJSON, _ := json.Marshal(map[string]any{
		"source":       map[string]string{"type": "image", "image": "myreg.io/api:1.0"},
		"port":         port,
		"startCommand": nil,
		"instances":    2,
		"resources":    map[string]any{"cpu": 0.5, "memory": memMB},
		"healthCheck":  map[string]any{"type": "http", "path": "/health"},
		"disks": []map[string]any{
			{"name": "data", "size": 1024, "path": "/var/lib/data"},
		},
	})

	p := deployment.Project{
		ID:   uuid.MustParse("00000000-0000-0000-0000-000000000999"),
		Slug: "demo",
		Name: "Demo",
	}
	state := deployment.State{
		Resources: []deployment.Resource{
			{ID: resID, Name: "api", Kind: "app", Spec: specJSON},
		},
		Variables: []deployment.Variable{
			{ID: uuid.MustParse("00000000-0000-0000-0000-00000000aaa1"),
				ResourceID: &resID, Key: "DATABASE_URL", Value: "postgres://...", Secret: true},
			{ID: uuid.MustParse("00000000-0000-0000-0000-00000000aaa2"),
				ResourceID: &resID, Key: "LOG_LEVEL", Value: "info", Secret: false},
		},
	}

	m := Build(p, state)
	got := mustYAML(t, m)
	checkGolden(t, "app.golden.yaml", got)
}

func TestBuild_RouteGolden(t *testing.T) {
	resID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	port := int32(8080)
	specJSON, _ := json.Marshal(map[string]any{
		"source":      map[string]string{"type": "image", "image": "n:1"},
		"port":        port,
		"instances":   1,
		"resources":   map[string]any{"cpu": 0.1, "memory": 128},
		"healthCheck": map[string]any{"type": "none"},
	})

	p := deployment.Project{Slug: "demo", Name: "Demo"}
	state := deployment.State{
		Resources: []deployment.Resource{
			{ID: resID, Name: "api", Kind: "app", Spec: specJSON},
		},
		Routes: []deployment.Route{
			{ID: uuid.MustParse("00000000-0000-0000-0000-00000000bbb1"),
				ResourceID: resID, Domain: "api.example.com", Path: "/", PathType: "prefix",
				Port: 8080, TLS: true},
		},
	}

	m := Build(p, state)
	got := mustYAML(t, m)
	checkGolden(t, "route.golden.yaml", got)
}

func TestBuild_RegistryGolden(t *testing.T) {
	resID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	port := int32(8080)
	specJSON, _ := json.Marshal(map[string]any{
		"source":      map[string]string{"type": "image", "image": "myreg.io/api:1.0"},
		"port":        port,
		"instances":   1,
		"resources":   map[string]any{"cpu": 0.1, "memory": 128},
		"healthCheck": map[string]any{"type": "none"},
	})

	p := deployment.Project{Slug: "demo", Name: "Demo"}
	state := deployment.State{
		Resources: []deployment.Resource{
			{ID: resID, Name: "api", Kind: "app", Spec: specJSON},
		},
		Registries: []deployment.Registry{
			{ID: uuid.MustParse("00000000-0000-0000-0000-00000000ccc1"),
				Name: "myreg", URL: "myreg.io", Username: "u", Password: "p"},
		},
	}

	m := Build(p, state)
	got := mustYAML(t, m)
	checkGolden(t, "registry.golden.yaml", got)
}

func mustYAML(t *testing.T, m Manifests) []byte {
	t.Helper()
	out, err := yaml.Marshal(m)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return out
}

func checkGolden(t *testing.T, name string, got []byte) {
	t.Helper()
	path := filepath.Join("testdata", name)
	if *update {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(path, got, 0o644); err != nil {
			t.Fatalf("write golden: %v", err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read golden (run -update first): %v", err)
	}
	if !bytesEqual(want, got) {
		t.Fatalf("golden mismatch for %s\n--- want ---\n%s\n--- got ---\n%s", name, want, got)
	}
}

func bytesEqual(a, b []byte) bool {
	return strings.TrimSpace(string(a)) == strings.TrimSpace(string(b))
}
