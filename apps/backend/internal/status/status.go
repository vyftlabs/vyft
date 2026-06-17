// Package status derives the live health of a project's resources from the
// cluster — the Deployment replica counts plus Pod container states — and
// maps it onto the wire ServiceState the service graph colors nodes by.
//
// It is read-only and best-effort: a cluster error yields no data rather
// than a failed request, so it can be folded into the resources list
// endpoint without coupling that endpoint's success to cluster reachability.
package status

import (
	"context"
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"

	"github.com/vyftlabs/vyft/apps/backend/internal/runtime/k8s"
)

// Status mirrors the spec ServiceStatus (state + optional message).
type Status struct {
	State   string
	Message string
}

// ServiceState values — kept in sync with packages/spec ServiceState.
const (
	StateRunning     = "running"
	StatePending     = "pending"
	StateDegraded    = "degraded"
	StateFailed      = "failed"
	StateStopped     = "stopped"
	StateTerminating = "terminating"
	StateUnknown     = "unknown"
)

// failureReasons are container waiting/terminated reasons that mean the pod
// can't run without intervention — bad image, bad config, or a crash loop.
// They outrank replica-count health when deriving state.
var failureReasons = map[string]bool{
	"CrashLoopBackOff":           true,
	"ImagePullBackOff":           true,
	"ErrImagePull":               true,
	"InvalidImageName":           true,
	"CreateContainerConfigError": true,
	"CreateContainerError":       true,
	"OOMKilled":                  true,
}

// ProjectStatuses returns the health of every deployed resource in a
// project, keyed by resource slug. Best-effort: a nil clientset or any
// cluster read error yields nil (the caller renders missing entries as
// "unknown"). Two list calls total — scales with projects, not resources.
func ProjectStatuses(ctx context.Context, cs kubernetes.Interface, dyn dynamic.Interface, projectSlug, envSlug string) map[string]Status {
	if cs == nil {
		return nil
	}
	ns := k8s.NamespaceFor(projectSlug, envSlug)
	sel := k8s.LabelProject + "=" + projectSlug

	deps, err := cs.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{LabelSelector: sel})
	if err != nil {
		return nil
	}
	stsets, err := cs.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{LabelSelector: sel})
	if err != nil {
		return nil
	}
	pods, err := cs.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{LabelSelector: sel})
	if err != nil {
		return nil
	}

	depPtrs := make([]*appsv1.Deployment, len(deps.Items))
	for i := range deps.Items {
		depPtrs[i] = &deps.Items[i]
	}
	stsPtrs := make([]*appsv1.StatefulSet, len(stsets.Items))
	for i := range stsets.Items {
		stsPtrs[i] = &stsets.Items[i]
	}
	podPtrs := make([]*corev1.Pod, len(pods.Items))
	for i := range pods.Items {
		podPtrs[i] = &pods.Items[i]
	}
	out := statusesFrom(depPtrs, stsPtrs, podPtrs)

	// CR-backed kinds (postgres → CNPG Cluster). The CR carries our labels;
	// derive from its status and merge. Tolerant: no dyn client or an absent
	// CRD just leaves those resources out (rendered "unknown").
	for slug, st := range clusterStatuses(ctx, dyn, ns, sel) {
		out[slug] = st
	}
	return out
}

// clusterStatuses lists CNPG Cluster CRs by project label and derives each
// one's status. Best-effort: nil dyn or any read error (e.g. CRD not
// installed) yields nil.
func clusterStatuses(ctx context.Context, dyn dynamic.Interface, ns, sel string) map[string]Status {
	if dyn == nil {
		return nil
	}
	list, err := dyn.Resource(k8s.CNPGClusterGVR).Namespace(ns).List(ctx, metav1.ListOptions{LabelSelector: sel})
	if err != nil {
		return nil
	}
	ptrs := make([]*unstructured.Unstructured, len(list.Items))
	for i := range list.Items {
		ptrs[i] = &list.Items[i]
	}
	return clusterStatusesFrom(ptrs)
}

// statusesFrom is the shared core: group pods by resource slug, then derive
// each deployment's status. Used by both the live list path and the
// informer-lister path (the watcher), which differ only in how they obtain
// the objects.
func statusesFrom(deps []*appsv1.Deployment, stsets []*appsv1.StatefulSet, pods []*corev1.Pod) map[string]Status {
	podsBySlug := map[string][]*corev1.Pod{}
	for _, p := range pods {
		if slug := p.Labels[k8s.LabelResource]; slug != "" {
			podsBySlug[slug] = append(podsBySlug[slug], p)
		}
	}

	out := make(map[string]Status, len(deps)+len(stsets))
	for _, d := range deps {
		slug := d.Labels[k8s.LabelResource]
		if slug == "" {
			slug = d.Name
		}
		out[slug] = derive(d, podsBySlug[slug])
	}
	// StatefulSet-backed kinds (e.g. operator-spawned redis). Our labels
	// propagate onto the StatefulSet, so it keys by resource like a Deployment.
	for _, s := range stsets {
		slug := s.Labels[k8s.LabelResource]
		if slug == "" {
			slug = s.Name
		}
		out[slug] = deriveSts(s, podsBySlug[slug])
	}
	return out
}

// clusterStatusesFrom derives a Status per CNPG Cluster CR, keyed by the
// resource slug from our label (falling back to the object name).
func clusterStatusesFrom(clusters []*unstructured.Unstructured) map[string]Status {
	out := make(map[string]Status, len(clusters))
	for _, c := range clusters {
		slug := c.GetLabels()[k8s.LabelResource]
		if slug == "" {
			slug = c.GetName()
		}
		out[slug] = deriveCluster(c)
	}
	return out
}

// deriveCluster maps a CNPG Cluster CR's status to a ServiceState. CNPG owns
// health aggregation (incl. failover), so we read spec.instances (desired) vs
// status.readyInstances. Phase strings are intentionally NOT matched — they're
// version-fragile; ready==0 reads as pending (bootstrapping), with the phase
// surfaced as the message.
func deriveCluster(c *unstructured.Unstructured) Status {
	if c.GetDeletionTimestamp() != nil {
		return Status{State: StateTerminating}
	}
	desired := nestedNum(c.Object, "spec", "instances")
	ready := nestedNum(c.Object, "status", "readyInstances")
	if desired == 0 {
		return Status{State: StateStopped}
	}
	switch {
	case ready >= desired:
		return Status{State: StateRunning}
	case ready > 0:
		return Status{State: StateDegraded, Message: fmt.Sprintf("%d/%d instances ready", ready, desired)}
	default:
		phase, _, _ := unstructured.NestedString(c.Object, "status", "phase")
		return Status{State: StatePending, Message: phase}
	}
}

// nestedNum reads an integer from the unstructured tree, tolerating both the
// int64 the dynamic client normally yields and a float64 from other decode
// paths — so a healthy cluster never mis-reads as 0 (→ "stopped").
func nestedNum(o map[string]any, fields ...string) int64 {
	if v, ok, _ := unstructured.NestedInt64(o, fields...); ok {
		return v
	}
	if v, ok, _ := unstructured.NestedFloat64(o, fields...); ok {
		return int64(v)
	}
	return 0
}

// derive maps one Deployment + its Pods to a Status. Order matters:
// terminating and stopped are intent-driven and short-circuit; hard pod
// failures outrank a healthy-looking replica count; otherwise the
// ready/desired ratio decides running vs degraded vs pending.
func derive(d *appsv1.Deployment, pods []*corev1.Pod) Status {
	desired := int32(0)
	if d.Spec.Replicas != nil {
		desired = *d.Spec.Replicas
	}
	return deriveWorkload(d.DeletionTimestamp != nil, desired, d.Status.ReadyReplicas, pods)
}

// deriveSts maps a StatefulSet (e.g. an operator-spawned redis) + its pods to
// a Status, same logic as a Deployment.
func deriveSts(s *appsv1.StatefulSet, pods []*corev1.Pod) Status {
	desired := int32(0)
	if s.Spec.Replicas != nil {
		desired = *s.Spec.Replicas
	}
	return deriveWorkload(s.DeletionTimestamp != nil, desired, s.Status.ReadyReplicas, pods)
}

// deriveWorkload is the shared replica-workload health logic. Order matters:
// terminating + stopped short-circuit; hard pod failures outrank a healthy
// replica count; otherwise ready/desired decides running/degraded/pending.
func deriveWorkload(terminating bool, desired, ready int32, pods []*corev1.Pod) Status {
	if terminating {
		return Status{State: StateTerminating}
	}
	if desired == 0 {
		return Status{State: StateStopped}
	}
	if reason, ok := firstFailure(pods); ok {
		return Status{State: StateFailed, Message: reason}
	}
	switch {
	case ready >= desired:
		return Status{State: StateRunning}
	case ready > 0:
		return Status{State: StateDegraded, Message: fmt.Sprintf("%d/%d replicas ready", ready, desired)}
	default:
		if reason := firstWaiting(pods); reason != "" {
			return Status{State: StatePending, Message: reason}
		}
		return Status{State: StatePending}
	}
}

// firstFailure returns the first hard-failure reason across a resource's
// pods. Checks the current waiting/terminated state plus the last
// termination — a crash loop shows OOMKilled on LastTerminationState while
// the current state is a CrashLoopBackOff wait.
func firstFailure(pods []*corev1.Pod) (string, bool) {
	for i := range pods {
		for _, cs := range pods[i].Status.ContainerStatuses {
			if w := cs.State.Waiting; w != nil && failureReasons[w.Reason] {
				return w.Reason, true
			}
			if t := cs.State.Terminated; t != nil && failureReasons[t.Reason] {
				return t.Reason, true
			}
			if l := cs.LastTerminationState.Terminated; l != nil && failureReasons[l.Reason] {
				return l.Reason, true
			}
		}
	}
	return "", false
}

// firstWaiting returns the most informative not-yet-ready reason for the
// pending state — a container waiting reason (ContainerCreating,
// PodInitializing) or a bare "Pending" when the pod hasn't scheduled yet.
func firstWaiting(pods []*corev1.Pod) string {
	for i := range pods {
		for _, cs := range pods[i].Status.ContainerStatuses {
			if w := cs.State.Waiting; w != nil {
				return w.Reason
			}
		}
		if pods[i].Status.Phase == corev1.PodPending {
			return "Pending"
		}
	}
	return ""
}
