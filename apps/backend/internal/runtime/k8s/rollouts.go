package k8s

import (
	"context"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
)

// revisionAnnotation ties a ReplicaSet to a Deployment revision; the RS whose
// revision matches the Deployment's current revision is the one this apply
// produced.
const revisionAnnotation = "deployment.kubernetes.io/revision"

// RolloutHashes reads back, per resource slug, the pod-template-hash of the
// ReplicaSet the just-applied Deployment rolled out to. The controller creates
// the RS asynchronously, so it polls briefly until every resource resolves (or
// times out). Best-effort: returns whatever it has resolved on timeout/error.
func (r *Runtime) RolloutHashes(ctx context.Context, p deployment.Project, env string, s deployment.State) (map[string]string, error) {
	ns := NamespaceFor(p.Slug, env)
	sel := LabelProject + "=" + p.Slug

	want := make(map[string]struct{}, len(s.Resources))
	for _, res := range s.Resources {
		want[res.Slug] = struct{}{}
	}

	out := make(map[string]string, len(want))
	const attempts = 12
	for i := 0; i < attempts; i++ {
		deps, err := r.cs.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{LabelSelector: sel})
		if err != nil {
			return out, err
		}
		rss, err := r.cs.AppsV1().ReplicaSets(ns).List(ctx, metav1.ListOptions{LabelSelector: sel})
		if err != nil {
			return out, err
		}

		// Current revision per resource Deployment.
		rev := make(map[string]string, len(deps.Items))
		for j := range deps.Items {
			d := &deps.Items[j]
			slug := d.Labels[LabelResource]
			if slug == "" {
				slug = d.Name
			}
			rev[slug] = d.Annotations[revisionAnnotation]
		}

		for j := range rss.Items {
			rs := &rss.Items[j]
			slug := rs.Labels[LabelResource]
			if slug == "" {
				continue
			}
			if _, done := out[slug]; done {
				continue
			}
			if r := rs.Annotations[revisionAnnotation]; r != "" && r == rev[slug] {
				if h := rs.Labels[appsv1.DefaultDeploymentUniqueLabelKey]; h != "" {
					out[slug] = h
				}
			}
		}

		resolved := true
		for slug := range want {
			if _, ok := out[slug]; !ok {
				resolved = false
				break
			}
		}
		if resolved {
			break
		}

		select {
		case <-ctx.Done():
			return out, ctx.Err()
		case <-time.After(300 * time.Millisecond):
		}
	}
	return out, nil
}
