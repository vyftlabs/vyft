// Package k8sevents reads Kubernetes Events for a vyft resource. Events live
// in etcd with a short TTL (kube-apiserver --event-ttl, default 1h) and carry
// no vyft labels, so they're matched to a resource by involved-object name:
// the Deployment is named by the slug, its ReplicaSets and Pods by "<slug>-…".
//
// Both the REST list handler and the SSE stream share List/Matches/Convert so
// the wire shape stays identical across the snapshot and the live feed.
package k8sevents

import (
	"context"
	"sort"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// Event is the normalized form of a k8s Event for a resource.
type Event struct {
	ID           string
	Type         string // "Normal" | "Warning"
	Reason       string
	Message      string
	Timestamp    time.Time
	InvolvedKind string
	InvolvedName string
	Count        int
}

// List returns the resource's recent events (Deployment + ReplicaSets + Pods),
// oldest first. Best-effort: a nil client yields nil.
func List(ctx context.Context, cs kubernetes.Interface, namespace, slug string) ([]Event, error) {
	if cs == nil {
		return nil, nil
	}
	raw, err := cs.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]Event, 0, len(raw.Items))
	for i := range raw.Items {
		ev := &raw.Items[i]
		if Matches(ev, slug) {
			out = append(out, Convert(ev))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Timestamp.Before(out[j].Timestamp) })
	return out, nil
}

// Matches reports whether an event's involved object belongs to the resource.
// Deployment name == slug; ReplicaSet/Pod names are "<slug>-<suffix>".
func Matches(ev *corev1.Event, slug string) bool {
	n := ev.InvolvedObject.Name
	return n == slug || strings.HasPrefix(n, slug+"-")
}

// ParseHash extracts the pod-template-hash from an involved object name, given
// the resource slug. ReplicaSet "<slug>-<hash>" → hash; Pod "<slug>-<hash>-<rand>"
// → hash. Returns "" for the Deployment object itself (name == slug) or any
// name that doesn't carry a hash segment.
func ParseHash(involvedName, slug string) string {
	rest, ok := strings.CutPrefix(involvedName, slug+"-")
	if !ok || rest == "" {
		return ""
	}
	// First segment is the hash; a Pod appends "-<rand>" which we drop.
	if i := strings.IndexByte(rest, '-'); i >= 0 {
		return rest[:i]
	}
	return rest
}

// Convert normalizes a k8s Event. Timestamp prefers LastTimestamp, then
// EventTime, then FirstTimestamp — different sources populate different fields.
func Convert(ev *corev1.Event) Event {
	ts := ev.LastTimestamp.Time
	if ts.IsZero() {
		ts = ev.EventTime.Time
	}
	if ts.IsZero() {
		ts = ev.FirstTimestamp.Time
	}
	typ := ev.Type
	if typ == "" {
		typ = "Normal"
	}
	count := int(ev.Count)
	if count < 1 {
		count = 1
	}
	return Event{
		ID:           string(ev.UID),
		Type:         typ,
		Reason:       ev.Reason,
		Message:      ev.Message,
		Timestamp:    ts,
		InvolvedKind: ev.InvolvedObject.Kind,
		InvolvedName: ev.InvolvedObject.Name,
		Count:        count,
	}
}
