// Package k8s is the production Runtime. Implements Apply by SSA-ing the
// build output and pruning the rest by label.
package k8s

import (
	"context"

	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"

	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
)

// Runtime implements deployment.Runtime against a k8s cluster.
type Runtime struct {
	cs  kubernetes.Interface
	dyn dynamic.Interface
}

func New(cs kubernetes.Interface, dyn dynamic.Interface) *Runtime {
	return &Runtime{cs: cs, dyn: dyn}
}

// Apply: ensureNamespace → Build → applyAll → pruneByLabel.
func (r *Runtime) Apply(ctx context.Context, p deployment.Project, env string, s deployment.State) error {
	ns := NamespaceFor(p.Slug, env)
	if err := ensureNamespace(ctx, r.cs, ns, p, env); err != nil {
		return err
	}
	m := Build(p, s)
	if err := applyAll(ctx, r.cs, r.dyn, ns, m); err != nil {
		return err
	}
	return pruneByLabel(ctx, r.dyn, ns, p.Slug, collectKnown(m))
}
