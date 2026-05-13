package k8s

import (
	"context"
	"fmt"

	corev1ac "k8s.io/client-go/applyconfigurations/core/v1"
	metav1ac "k8s.io/client-go/applyconfigurations/meta/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
)

// Labels.
const (
	LabelProject     = "vyft.dev/project"
	LabelEnvironment = "vyft.dev/environment"
	LabelResource    = "vyft.dev/resource"
	FieldManager     = "vyft"
)

// NamespaceFor returns the deterministic namespace name for a project+env.
// Slug is immutable so the name is stable for the life of the project.
func NamespaceFor(slug, env string) string {
	return fmt.Sprintf("vyft-%s-%s", slug, env)
}

// ensureNamespace SSAs the namespace with project/env labels. Idempotent.
func ensureNamespace(ctx context.Context, cs kubernetes.Interface, ns string, p deployment.Project, env string) error {
	cfg := corev1ac.Namespace(ns).
		WithLabels(map[string]string{
			LabelProject:     p.Slug,
			LabelEnvironment: env,
		})
	_, err := cs.CoreV1().Namespaces().Apply(ctx, cfg, metav1.ApplyOptions{
		FieldManager: FieldManager,
		Force:        true,
	})
	if err != nil {
		return fmt.Errorf("ensure namespace %s: %w", ns, err)
	}
	return nil
}

// DeleteProjectNamespaces deletes every namespace labeled
// vyft.dev/project=<slug>. Foreground propagation. Best-effort — caller
// logs and continues.
func DeleteProjectNamespaces(ctx context.Context, cs kubernetes.Interface, slug string) error {
	list, err := cs.CoreV1().Namespaces().List(ctx, metav1.ListOptions{
		LabelSelector: LabelProject + "=" + slug,
	})
	if err != nil {
		return fmt.Errorf("list project namespaces: %w", err)
	}
	prop := metav1.DeletePropagationForeground
	delOpts := metav1.DeleteOptions{PropagationPolicy: &prop}
	for _, ns := range list.Items {
		if err := cs.CoreV1().Namespaces().Delete(ctx, ns.Name, delOpts); err != nil {
			return fmt.Errorf("delete namespace %s: %w", ns.Name, err)
		}
	}
	return nil
}

// stdLabels returns the standard label set for any owned object. `resource`
// is empty for namespace-scoped objects that aren't tied to a single Resource
// (e.g. registry pull-secrets).
func stdLabels(p deployment.Project, resource string) map[string]string {
	l := map[string]string{LabelProject: p.Slug}
	if resource != "" {
		l[LabelResource] = resource
	}
	return l
}

// withStdMeta is a small helper for tests / parity — apply configurations
// already accept .WithLabels directly, but builders sometimes need a
// detachable map.
func withStdMeta(ac *metav1ac.ObjectMetaApplyConfiguration, p deployment.Project, resource string) *metav1ac.ObjectMetaApplyConfiguration {
	for k, v := range stdLabels(p, resource) {
		ac.WithLabels(map[string]string{k: v})
	}
	return ac
}
