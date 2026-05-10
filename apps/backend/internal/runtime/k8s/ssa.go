package k8s

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/utils/ptr"
)

var (
	deploymentsGVR = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
	servicesGVR    = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}
	pvcsGVR        = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "persistentvolumeclaims"}
	ingressesGVR   = schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}
	secretsGVR     = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "secrets"}
)

// applyAll SSAs every manifest in order: secrets → PVCs → deployments →
// services → ingresses. Order matters for first-create races: secrets and
// PVCs must exist before pods can mount them.
func applyAll(ctx context.Context, cs kubernetes.Interface, ns string, m Manifests) error {
	opts := metav1.ApplyOptions{FieldManager: FieldManager, Force: true}

	for _, s := range m.Secrets {
		if _, err := cs.CoreV1().Secrets(ns).Apply(ctx, s, opts); err != nil {
			return fmt.Errorf("apply secret %s: %w", deref(s.Name), err)
		}
	}
	for _, p := range m.PVCs {
		if _, err := cs.CoreV1().PersistentVolumeClaims(ns).Apply(ctx, p, opts); err != nil {
			return fmt.Errorf("apply pvc %s: %w", deref(p.Name), err)
		}
	}
	for _, d := range m.Deployments {
		if _, err := cs.AppsV1().Deployments(ns).Apply(ctx, d, opts); err != nil {
			return fmt.Errorf("apply deployment %s: %w", deref(d.Name), err)
		}
	}
	for _, s := range m.Services {
		if _, err := cs.CoreV1().Services(ns).Apply(ctx, s, opts); err != nil {
			return fmt.Errorf("apply service %s: %w", deref(s.Name), err)
		}
	}
	for _, i := range m.Ingresses {
		if _, err := cs.NetworkingV1().Ingresses(ns).Apply(ctx, i, opts); err != nil {
			return fmt.Errorf("apply ingress %s: %w", deref(i.Name), err)
		}
	}
	return nil
}

// pruneByLabel deletes objects in `ns` labeled vyft.dev/project=<slug> whose
// names aren't in the known set for that GVR. Foreground propagation so the
// caller sees a clean cluster after Apply returns.
func pruneByLabel(ctx context.Context, dyn dynamic.Interface, ns, slug string, known knownNames) error {
	selector := LabelProject + "=" + slug
	delOpts := metav1.DeleteOptions{
		PropagationPolicy: ptr.To(metav1.DeletePropagationForeground),
	}

	type pair struct {
		gvr   schema.GroupVersionResource
		known map[string]struct{}
	}
	for _, kp := range []pair{
		{deploymentsGVR, known.deployments},
		{servicesGVR, known.services},
		{pvcsGVR, known.pvcs},
		{ingressesGVR, known.ingresses},
		{secretsGVR, known.secrets},
	} {
		list, err := dyn.Resource(kp.gvr).Namespace(ns).List(ctx, metav1.ListOptions{
			LabelSelector: selector,
		})
		if err != nil {
			return fmt.Errorf("prune list %s: %w", kp.gvr.Resource, err)
		}
		for _, obj := range list.Items {
			if _, keep := kp.known[obj.GetName()]; keep {
				continue
			}
			if err := dyn.Resource(kp.gvr).Namespace(ns).Delete(ctx, obj.GetName(), delOpts); err != nil {
				return fmt.Errorf("prune delete %s/%s: %w", kp.gvr.Resource, obj.GetName(), err)
			}
		}
	}
	return nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
