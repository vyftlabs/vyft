package k8s

import (
	"encoding/json"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	"k8s.io/apimachinery/pkg/util/intstr"
	appsv1ac "k8s.io/client-go/applyconfigurations/apps/v1"
	corev1ac "k8s.io/client-go/applyconfigurations/core/v1"
	metav1ac "k8s.io/client-go/applyconfigurations/meta/v1"

	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
)

// appSpec mirrors packages/spec AppSpec. Only the fields the runtime
// consumes are typed; anything else is ignored.
type appSpec struct {
	Source struct {
		Type  string `json:"type"`
		Image string `json:"image"`
	} `json:"source"`
	Port         *int32  `json:"port"`
	StartCommand *string `json:"startCommand"`
	Instances    int32   `json:"instances"`
	Resources    struct {
		CPU    float64 `json:"cpu"`
		Memory int64   `json:"memory"` // megabytes
	} `json:"resources"`
	HealthCheck json.RawMessage `json:"healthCheck"`
	Disks       []appDisk       `json:"disks"`
}

type appDisk struct {
	Name string `json:"name"`
	Size int64  `json:"size"` // megabytes
	Path string `json:"path"`
}

// buildApp emits Deployment + Service + per-disk PVC + per-resource env Secret.
// Names use the resource name directly — DNS-1123 compliant by spec, unique
// per project, namespace-scoped so collisions impossible.
func buildApp(m *Manifests, p deployment.Project, r deployment.Resource, rvars []resolvedVar) {
	var spec appSpec
	if err := json.Unmarshal(r.Spec, &spec); err != nil {
		return
	}

	labels := stdLabels(p, r.Slug)
	selector := map[string]string{LabelProject: p.Slug, LabelResource: r.Slug}

	// Per-resource env Secret (only when there's at least one secret value).
	var secretApplied bool
	if hasSecrets(rvars) {
		secret := buildAppSecret(p, r, rvars)
		m.Secrets = append(m.Secrets, secret)
		secretApplied = true
	}

	// Container env: plain values inline, secrets via secretKeyRef.
	envEntries := make([]*corev1ac.EnvVarApplyConfiguration, 0, len(rvars))
	for _, v := range rvars {
		if v.Secret {
			envEntries = append(envEntries, corev1ac.EnvVar().
				WithName(v.Key).
				WithValueFrom(corev1ac.EnvVarSource().
					WithSecretKeyRef(corev1ac.SecretKeySelector().
						WithName(appSecretName(r.Slug)).
						WithKey(v.Key))))
		} else {
			envEntries = append(envEntries, corev1ac.EnvVar().
				WithName(v.Key).
				WithValue(v.Value))
		}
	}
	_ = secretApplied // kept for parity; prune relies on secretApplied via labels

	// Container.
	container := corev1ac.Container().
		WithName(r.Slug).
		WithImage(spec.Source.Image).
		WithEnv(envEntries...)

	if spec.Port != nil {
		container.WithPorts(corev1ac.ContainerPort().
			WithName("http").
			WithContainerPort(*spec.Port).
			WithProtocol(corev1.ProtocolTCP))
	}
	if spec.StartCommand != nil && *spec.StartCommand != "" {
		container.WithCommand("sh", "-c", *spec.StartCommand)
	}

	// Resources: cpu cores → millicores, memory MB → MiB request quantity.
	cpuQty := resource.MustParse(fmt.Sprintf("%dm", int(spec.Resources.CPU*1000)))
	memQty := resource.MustParse(fmt.Sprintf("%dMi", spec.Resources.Memory))
	container.WithResources(corev1ac.ResourceRequirements().
		WithRequests(corev1.ResourceList{
			corev1.ResourceCPU:    cpuQty,
			corev1.ResourceMemory: memQty,
		}).
		WithLimits(corev1.ResourceList{
			corev1.ResourceCPU:    cpuQty,
			corev1.ResourceMemory: memQty,
		}))

	// Probes from healthCheck.
	if probe := buildProbe(spec.HealthCheck, spec.Port); probe != nil {
		container.WithReadinessProbe(probe).WithLivenessProbe(cloneProbe(probe))
	}

	// VolumeMounts (one per disk).
	if len(spec.Disks) > 0 {
		mounts := make([]*corev1ac.VolumeMountApplyConfiguration, 0, len(spec.Disks))
		for _, d := range spec.Disks {
			mounts = append(mounts, corev1ac.VolumeMount().
				WithName(diskVolumeName(d.Name)).
				WithMountPath(d.Path))
		}
		container.WithVolumeMounts(mounts...)
	}

	// Pod spec: container + per-disk PVC volumes + imagePullSecrets.
	podSpec := corev1ac.PodSpec().WithContainers(container)
	if len(spec.Disks) > 0 {
		vols := make([]*corev1ac.VolumeApplyConfiguration, 0, len(spec.Disks))
		for _, d := range spec.Disks {
			vols = append(vols, corev1ac.Volume().
				WithName(diskVolumeName(d.Name)).
				WithPersistentVolumeClaim(corev1ac.PersistentVolumeClaimVolumeSource().
					WithClaimName(pvcName(r.Slug, d.Name))))
		}
		podSpec.WithVolumes(vols...)
	}

	// PodTemplate.
	podTemplate := corev1ac.PodTemplateSpec().
		WithLabels(selector).
		WithSpec(podSpec)

	// Deployment.
	dep := appsv1ac.Deployment(r.Slug, "").
		WithLabels(labels).
		WithSpec(appsv1ac.DeploymentSpec().
			WithReplicas(spec.Instances).
			WithSelector(metav1ac.LabelSelector().
				WithMatchLabels(selector)).
			WithTemplate(podTemplate))
	m.Deployments = append(m.Deployments, dep)

	// Service (only when port != nil).
	if spec.Port != nil {
		svc := corev1ac.Service(r.Slug, "").
			WithLabels(labels).
			WithSpec(corev1ac.ServiceSpec().
				WithType(corev1.ServiceTypeClusterIP).
				WithSelector(selector).
				WithPorts(corev1ac.ServicePort().
					WithName("http").
					WithPort(*spec.Port).
					WithTargetPort(intstr.FromString("http")).
					WithProtocol(corev1.ProtocolTCP)))
		m.Services = append(m.Services, svc)
	}

	// PVCs (one per disk).
	for _, d := range spec.Disks {
		size := resource.MustParse(fmt.Sprintf("%dMi", d.Size))
		pvc := corev1ac.PersistentVolumeClaim(pvcName(r.Slug, d.Name), "").
			WithLabels(stdLabels(p, r.Slug)).
			WithSpec(corev1ac.PersistentVolumeClaimSpec().
				WithAccessModes(corev1.ReadWriteOnce).
				WithResources(corev1ac.VolumeResourceRequirements().
					WithRequests(corev1.ResourceList{
						corev1.ResourceStorage: size,
					})))
		m.PVCs = append(m.PVCs, pvc)
	}

	// imagePullSecrets — added last so we know all registry secret names. We
	// reference every registry in scope; k8s tries each in turn.
	// Wired in buildRegistries (it patches PodSpec via a follow-up pass).
}

// buildAppSecret returns the per-resource Secret. Stores secret values as
// stringData; non-secret values stay inline on the container.
func buildAppSecret(p deployment.Project, r deployment.Resource, rvars []resolvedVar) *corev1ac.SecretApplyConfiguration {
	data := map[string]string{}
	for _, v := range rvars {
		if v.Secret {
			data[v.Key] = v.Value
		}
	}
	return corev1ac.Secret(appSecretName(r.Slug), "").
		WithLabels(stdLabels(p, r.Slug)).
		WithType(corev1.SecretTypeOpaque).
		WithStringData(data)
}

func hasSecrets(rvars []resolvedVar) bool {
	for _, v := range rvars {
		if v.Secret {
			return true
		}
	}
	return false
}

func appSecretName(resourceName string) string {
	return resourceName + "-env"
}

func pvcName(resourceName, diskName string) string {
	return resourceName + "-" + diskName
}

func diskVolumeName(diskName string) string {
	return diskName
}

// buildProbe maps healthCheck JSON to a Probe ApplyConfiguration.
func buildProbe(raw json.RawMessage, defaultPort *int32) *corev1ac.ProbeApplyConfiguration {
	if len(raw) == 0 {
		return nil
	}
	var probe struct {
		Type    string `json:"type"`
		Path    string `json:"path"`
		Port    *int32 `json:"port"`
		Command string `json:"command"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return nil
	}
	switch probe.Type {
	case "http":
		port := probe.Port
		if port == nil {
			port = defaultPort
		}
		if port == nil {
			return nil
		}
		path := probe.Path
		if path == "" {
			path = "/"
		}
		return corev1ac.Probe().
			WithHTTPGet(corev1ac.HTTPGetAction().
				WithPath(path).
				WithPort(intstr.FromInt(int(*port))))
	case "tcp":
		if probe.Port == nil {
			return nil
		}
		return corev1ac.Probe().
			WithTCPSocket(corev1ac.TCPSocketAction().
				WithPort(intstr.FromInt(int(*probe.Port))))
	case "command":
		if strings.TrimSpace(probe.Command) == "" {
			return nil
		}
		return corev1ac.Probe().
			WithExec(corev1ac.ExecAction().
				WithCommand("sh", "-c", probe.Command))
	}
	return nil
}

// cloneProbe deep-copies a probe ApplyConfiguration. ApplyConfigurations
// are pointer-shaped so we marshal+unmarshal as the simplest deep clone.
func cloneProbe(p *corev1ac.ProbeApplyConfiguration) *corev1ac.ProbeApplyConfiguration {
	if p == nil {
		return nil
	}
	raw, err := json.Marshal(p)
	if err != nil {
		return p
	}
	var out corev1ac.ProbeApplyConfiguration
	if err := json.Unmarshal(raw, &out); err != nil {
		return p
	}
	return &out
}
