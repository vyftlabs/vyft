package k8s

import (
	"encoding/json"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	corev1ac "k8s.io/client-go/applyconfigurations/core/v1"

	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
)

// redisSpec mirrors packages/spec RedisSpec — only the fields the runtime
// renders into the Redis CR are typed.
type redisSpec struct {
	Version   string `json:"version"`
	Storage   int64  `json:"storage"` // megabytes; 0 = ephemeral
	Resources struct {
		CPU    float64 `json:"cpu"`
		Memory int64   `json:"memory"` // megabytes
	} `json:"resources"`
}

const (
	redisExporterImage = "quay.io/opstree/redis-exporter:v1.44.0"
	redisExporterPort  = 9121
	redisSecretKey     = "REDIS_PASSWORD"
)

// redisImage maps a major version to the OT-maintained Redis image tag.
func redisImage(version string) string {
	if version == "6" {
		return "quay.io/opstree/redis:v6.2.14"
	}
	return "quay.io/opstree/redis:v7.0.15"
}

func redisSecretName(slug string) string { return slug + "-redis" }

// buildRedis emits an OT redis-operator Redis CR + the auth Secret it
// references + a PodMonitor scraping the redis_exporter sidecar. The operator
// owns the spawned StatefulSet/Services/PVC; our labels propagate onto them
// (so status/metrics select by resource), and they carry a controller
// ownerReference so the prune path leaves them to the operator.
//
// The password is the resource's own REDIS_PASSWORD variable (we generate +
// own it at create time), read from rvars and written into the auth Secret.
func buildRedis(m *Manifests, p deployment.Project, r deployment.Resource, rvars []resolvedVar) {
	var spec redisSpec
	if err := json.Unmarshal(r.Spec, &spec); err != nil {
		return
	}

	var password string
	for _, v := range rvars {
		if v.Key == redisSecretKey {
			password = v.Value
			break
		}
	}

	m.Secrets = append(m.Secrets, corev1ac.Secret(redisSecretName(r.Slug), "").
		WithLabels(stdLabels(p, r.Slug)).
		WithType(corev1.SecretTypeOpaque).
		WithStringData(map[string]string{redisSecretKey: password}))

	cpu := fmt.Sprintf("%dm", int(spec.Resources.CPU*1000))
	mem := fmt.Sprintf("%dMi", spec.Resources.Memory)

	redisCRSpec := map[string]any{
		"kubernetesConfig": map[string]any{
			"image":           redisImage(spec.Version),
			"imagePullPolicy": "IfNotPresent",
			"resources": map[string]any{
				"requests": map[string]any{"cpu": cpu, "memory": mem},
				"limits":   map[string]any{"cpu": cpu, "memory": mem},
			},
			"redisSecret": map[string]any{
				"name": redisSecretName(r.Slug),
				"key":  redisSecretKey,
			},
		},
		"redisExporter": map[string]any{
			"enabled": true,
			"image":   redisExporterImage,
			// The exporter must authenticate to the password-protected redis,
			// else every redis_* metric (incl. redis_up) reads 0.
			"env": []any{
				map[string]any{
					"name": "REDIS_PASSWORD",
					"valueFrom": map[string]any{
						"secretKeyRef": map[string]any{
							"name": redisSecretName(r.Slug),
							"key":  redisSecretKey,
						},
					},
				},
			},
		},
	}
	if spec.Storage > 0 {
		redisCRSpec["storage"] = map[string]any{
			"volumeClaimTemplate": map[string]any{
				"spec": map[string]any{
					"accessModes": []any{"ReadWriteOnce"},
					"resources": map[string]any{
						"requests": map[string]any{"storage": fmt.Sprintf("%dMi", spec.Storage)},
					},
				},
			},
		}
	}

	m.RedisCRs = append(m.RedisCRs, &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": RedisGVR.Group + "/" + RedisGVR.Version,
		"kind":       "Redis",
		"metadata": map[string]any{
			"name":   r.Slug,
			"labels": labelsToAny(stdLabels(p, r.Slug)),
		},
		"spec": redisCRSpec,
	}})

	// Scrape the exporter on our labelled pods (the operator copies our labels
	// onto them). Prometheus selects all PodMonitors (see values-kps.yaml).
	m.PodMonitors = append(m.PodMonitors, &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": PodMonitorGVR.Group + "/" + PodMonitorGVR.Version,
		"kind":       "PodMonitor",
		"metadata": map[string]any{
			"name":   r.Slug,
			"labels": labelsToAny(stdLabels(p, r.Slug)),
		},
		"spec": map[string]any{
			"selector": map[string]any{
				"matchLabels": map[string]any{LabelResource: r.Slug},
			},
			"podMetricsEndpoints": []any{
				map[string]any{"targetPort": int64(redisExporterPort)},
			},
		},
	}})
}
