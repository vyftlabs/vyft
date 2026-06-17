package k8s

import (
	"encoding/json"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	corev1ac "k8s.io/client-go/applyconfigurations/core/v1"

	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
)

// postgresSpec mirrors packages/spec PostgresSpec — only the fields the
// runtime renders into the Cluster CR are typed.
type postgresSpec struct {
	Version   string `json:"version"`
	Instances int32  `json:"instances"`
	Storage   int64  `json:"storage"` // megabytes
	Resources struct {
		CPU    float64 `json:"cpu"`
		Memory int64   `json:"memory"` // megabytes
	} `json:"resources"`
	Database string          `json:"database"`
	Backup   *postgresBackup `json:"backup"`
}

// postgresBackup mirrors packages/spec PostgresBackup.
type postgresBackup struct {
	DestinationPath string `json:"destinationPath"`
	EndpointURL     string `json:"endpointURL"`
	Region          string `json:"region"`
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	Schedule        string `json:"schedule"`
	RetentionDays   int    `json:"retentionDays"`
	Compression     string `json:"compression"`
}

// backupSecretName / key names for the rendered S3 credentials Secret.
const (
	backupAccessKeyIDKey     = "ACCESS_KEY_ID"
	backupSecretAccessKeyKey = "ACCESS_SECRET_KEY"
	backupRegionKey          = "AWS_REGION"
)

func backupSecretName(slug string) string { return slug + "-backup" }

// cnpgImage is the CloudNativePG-maintained Postgres image; the major-version
// tag selects the engine.
func cnpgImage(version string) string {
	return fmt.Sprintf("ghcr.io/cloudnative-pg/postgresql:%s", version)
}

// buildPostgres emits a CloudNativePG Cluster CR. The operator owns the
// underlying StatefulSet/PVCs/failover and generates the `<slug>-app`
// connection Secret; we only declare desired state.
//
// The Cluster carries the project label so the prune path reclaims it when the
// resource is deleted — the operator then garbage-collects its children, which
// keep their own cnpg.io labels and are left untouched by our label prune.
func buildPostgres(m *Manifests, p deployment.Project, r deployment.Resource) {
	var spec postgresSpec
	if err := json.Unmarshal(r.Spec, &spec); err != nil {
		return
	}
	if spec.Instances < 1 {
		spec.Instances = 1
	}

	cpu := fmt.Sprintf("%dm", int(spec.Resources.CPU*1000))
	mem := fmt.Sprintf("%dMi", spec.Resources.Memory)

	cluster := &unstructured.Unstructured{
		Object: map[string]any{
			"apiVersion": CNPGClusterGVR.Group + "/" + CNPGClusterGVR.Version,
			"kind":       "Cluster",
			"metadata": map[string]any{
				"name":   r.Slug,
				"labels": labelsToAny(stdLabels(p, r.Slug)),
			},
			"spec": map[string]any{
				"instances": int64(spec.Instances),
				"imageName": cnpgImage(spec.Version),
				// Expose CNPG's per-instance Prometheus metrics via a
				// PodMonitor (scraped by kube-prometheus-stack).
				"monitoring": map[string]any{
					"enablePodMonitor": true,
				},
				"storage": map[string]any{
					"size": fmt.Sprintf("%dMi", spec.Storage),
				},
				"resources": map[string]any{
					"requests": map[string]any{"cpu": cpu, "memory": mem},
					"limits":   map[string]any{"cpu": cpu, "memory": mem},
				},
				"bootstrap": map[string]any{
					"initdb": map[string]any{
						"database": spec.Database,
						"owner":    spec.Database,
					},
				},
			},
		},
	}

	// Backups: render an S3-credentials Secret, attach barmanObjectStore +
	// retentionPolicy to the Cluster, and emit a ScheduledBackup CR.
	if b := spec.Backup; b != nil {
		clusterSpec := cluster.Object["spec"].(map[string]any)
		clusterSpec["backup"] = backupConfig(r.Slug, b)
		m.Secrets = append(m.Secrets, buildBackupSecret(p, r, b))
		m.ScheduledBackups = append(m.ScheduledBackups, buildScheduledBackup(p, r, b))
	}

	m.Clusters = append(m.Clusters, cluster)
}

// backupConfig builds Cluster.spec.backup (barmanObjectStore + retentionPolicy).
func backupConfig(slug string, b *postgresBackup) map[string]any {
	secret := backupSecretName(slug)
	s3 := map[string]any{
		"accessKeyId":     map[string]any{"name": secret, "key": backupAccessKeyIDKey},
		"secretAccessKey": map[string]any{"name": secret, "key": backupSecretAccessKeyKey},
	}
	if b.Region != "" {
		s3["region"] = map[string]any{"name": secret, "key": backupRegionKey}
	}
	store := map[string]any{
		"destinationPath": b.DestinationPath,
		"s3Credentials":   s3,
	}
	if b.EndpointURL != "" {
		store["endpointURL"] = b.EndpointURL
	}
	if b.Compression != "" && b.Compression != "none" {
		store["wal"] = map[string]any{"compression": b.Compression}
		store["data"] = map[string]any{"compression": b.Compression}
	}
	cfg := map[string]any{"barmanObjectStore": store}
	if b.RetentionDays > 0 {
		cfg["retentionPolicy"] = fmt.Sprintf("%dd", b.RetentionDays)
	}
	return cfg
}

// buildBackupSecret renders the S3 credentials into a per-resource Secret that
// barmanObjectStore's s3Credentials reference.
func buildBackupSecret(p deployment.Project, r deployment.Resource, b *postgresBackup) *corev1ac.SecretApplyConfiguration {
	data := map[string]string{
		backupAccessKeyIDKey:     b.AccessKeyID,
		backupSecretAccessKeyKey: b.SecretAccessKey,
	}
	if b.Region != "" {
		data[backupRegionKey] = b.Region
	}
	return corev1ac.Secret(backupSecretName(r.Slug), "").
		WithLabels(stdLabels(p, r.Slug)).
		WithType(corev1.SecretTypeOpaque).
		WithStringData(data)
}

// buildScheduledBackup emits a CNPG ScheduledBackup CR targeting the cluster.
func buildScheduledBackup(p deployment.Project, r deployment.Resource, b *postgresBackup) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]any{
			"apiVersion": CNPGScheduledBackupGVR.Group + "/" + CNPGScheduledBackupGVR.Version,
			"kind":       "ScheduledBackup",
			"metadata": map[string]any{
				"name":   backupSecretName(r.Slug),
				"labels": labelsToAny(stdLabels(p, r.Slug)),
			},
			"spec": map[string]any{
				"schedule":  b.Schedule,
				"method":    "barmanObjectStore",
				"immediate": true,
				"cluster":   map[string]any{"name": r.Slug},
			},
		},
	}
}

// labelsToAny widens a string map for the unstructured object tree, whose
// values must be one of the JSON-ish types (string/int64/float64/bool/map/[]).
func labelsToAny(in map[string]string) map[string]any {
	out := make(map[string]any, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
