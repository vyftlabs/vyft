package k8s

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	corev1ac "k8s.io/client-go/applyconfigurations/core/v1"
	"k8s.io/client-go/kubernetes"

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

// RegistrySecretName exposes the secret naming convention so non-deploy
// callers can address the same objects.
func RegistrySecretName(name string) string {
	return registrySecretName(name)
}

// ApplyRegistrySecret SSAs a single dockerconfigjson Secret into the given
// namespace. Idempotent; safe to call from project create + registry CRUD.
func ApplyRegistrySecret(ctx context.Context, cs kubernetes.Interface, namespace string, p deployment.Project, r deployment.Registry) error {
	secret := corev1ac.Secret(registrySecretName(r.Name), namespace).
		WithLabels(stdLabels(p, "")).
		WithType(corev1.SecretTypeDockerConfigJson).
		WithData(map[string][]byte{
			corev1.DockerConfigJsonKey: dockerConfigJSON(r.URL, r.Username, r.Password),
		})
	_, err := cs.CoreV1().Secrets(namespace).Apply(ctx, secret, metav1.ApplyOptions{
		FieldManager: FieldManager,
		Force:        true,
	})
	if err != nil {
		return fmt.Errorf("apply registry secret %s/%s: %w", namespace, registrySecretName(r.Name), err)
	}
	return nil
}

// DeleteRegistrySecretInNamespace removes a single registry secret. Returns
// nil if it doesn't exist.
func DeleteRegistrySecretInNamespace(ctx context.Context, cs kubernetes.Interface, namespace, registryName string) error {
	err := cs.CoreV1().Secrets(namespace).Delete(ctx, registrySecretName(registryName), metav1.DeleteOptions{})
	if err != nil && !apierrors.IsNotFound(err) {
		return fmt.Errorf("delete registry secret %s/%s: %w", namespace, registrySecretName(registryName), err)
	}
	return nil
}

// ListProjectNamespaces returns every namespace labeled `vyft.dev/project`
// alongside its slug — useful for cluster-wide reconcilers (registry sync).
type ProjectNamespace struct {
	Namespace string
	Slug      string
}

func ListProjectNamespaces(ctx context.Context, cs kubernetes.Interface) ([]ProjectNamespace, error) {
	list, err := cs.CoreV1().Namespaces().List(ctx, metav1.ListOptions{
		LabelSelector: LabelProject,
	})
	if err != nil {
		return nil, fmt.Errorf("list project namespaces: %w", err)
	}
	out := make([]ProjectNamespace, 0, len(list.Items))
	for _, ns := range list.Items {
		slug := ns.Labels[LabelProject]
		if slug == "" {
			continue
		}
		out = append(out, ProjectNamespace{Namespace: ns.Name, Slug: slug})
	}
	return out, nil
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
