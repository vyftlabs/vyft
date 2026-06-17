package source

import (
	"fmt"

	"github.com/vyftlabs/vyft/apps/backend/internal/runtime/k8s"
)

// ResourceSelector points a metrics query at a single resource within the
// cluster. Concrete sources (Prom, metrics-server) use these to filter
// their backends — Prom via PromQL label matchers, metrics-server via the
// metrics.k8s.io API's labelSelector parameter.
type ResourceSelector struct {
	// Namespace is the deterministic project+env namespace (e.g.
	// "vyft-demo-production").
	Namespace string

	// ResourceName is the Vyft resource name; used to build a pod label
	// selector "vyft.dev/resource=<name>" and to anchor PromQL pod regexes.
	ResourceName string

	// PodTemplateHash, when set, narrows the selection to a single rollout's
	// pods (a specific deployment). Empty = all of the resource's pods.
	PodTemplateHash string
}

func (s ResourceSelector) PodLabelSelector() string {
	base := fmt.Sprintf("%s=%s", k8s.LabelResource, s.ResourceName)
	if s.PodTemplateHash != "" {
		return fmt.Sprintf("%s,pod-template-hash=%s", base, s.PodTemplateHash)
	}
	return base
}

// PodNameRegex returns the anchored pod-name regex sources match on. With a
// hash it pins to one rollout ("<slug>-<hash>-.*"), else all ("<slug>-.*").
func (s ResourceSelector) PodNameRegex() string {
	if s.PodTemplateHash != "" {
		return fmt.Sprintf("%s-%s-.*", s.ResourceName, s.PodTemplateHash)
	}
	return fmt.Sprintf("%s-.*", s.ResourceName)
}

// PromPodRegex returns the anchored Prom regex the templates expect.
func (s ResourceSelector) PromPodRegex() string {
	return s.PodNameRegex()
}
