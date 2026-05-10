package k8s

import (
	"encoding/base64"
	"encoding/json"

	corev1 "k8s.io/api/core/v1"
	corev1ac "k8s.io/client-go/applyconfigurations/core/v1"

	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
)

// buildRegistries emits one dockerconfigjson Secret per registry, then
// patches every Deployment in the manifest to reference all of them via
// imagePullSecrets. K8s tries each pull secret in turn — adding more is
// safe (matching by image registry URL is k8s' job, not ours).
func buildRegistries(m *Manifests, p deployment.Project, regs []deployment.Registry) {
	if len(regs) == 0 {
		return
	}

	pullSecretRefs := make([]*corev1ac.LocalObjectReferenceApplyConfiguration, 0, len(regs))
	for _, r := range regs {
		secretName := registrySecretName(r.Name)
		dockerCfg := dockerConfigJSON(r.URL, r.Username, r.Password)
		secret := corev1ac.Secret(secretName, "").
			WithLabels(stdLabels(p, "")).
			WithType(corev1.SecretTypeDockerConfigJson).
			WithData(map[string][]byte{
				corev1.DockerConfigJsonKey: dockerCfg,
			})
		m.Secrets = append(m.Secrets, secret)
		pullSecretRefs = append(pullSecretRefs, corev1ac.LocalObjectReference().WithName(secretName))
	}

	// Patch every Deployment's PodSpec with imagePullSecrets.
	for _, d := range m.Deployments {
		if d.Spec == nil || d.Spec.Template == nil || d.Spec.Template.Spec == nil {
			continue
		}
		d.Spec.Template.Spec.WithImagePullSecrets(pullSecretRefs...)
	}
}

func registrySecretName(name string) string {
	return "vyft-registry-" + name
}

// dockerConfigJSON builds the .dockerconfigjson payload k8s expects.
func dockerConfigJSON(url, username, password string) []byte {
	auth := base64.StdEncoding.EncodeToString([]byte(username + ":" + password))
	cfg := map[string]any{
		"auths": map[string]any{
			url: map[string]any{
				"username": username,
				"password": password,
				"auth":     auth,
			},
		},
	}
	out, _ := json.Marshal(cfg)
	return out
}
