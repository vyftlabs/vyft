package status

import (
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/vyftlabs/vyft/apps/backend/internal/runtime/k8s"
)

func cluster(desired, ready int64) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"spec":   map[string]any{"instances": desired},
		"status": map[string]any{"readyInstances": ready},
	}}
}

func TestDeriveCluster(t *testing.T) {
	cases := []struct {
		name          string
		desired, ready int64
		want          string
	}{
		{"all ready", 1, 1, StateRunning},
		{"ha ready", 3, 3, StateRunning},
		{"partial", 3, 1, StateDegraded},
		{"none ready", 1, 0, StatePending},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := deriveCluster(cluster(c.desired, c.ready)).State; got != c.want {
				t.Fatalf("desired=%d ready=%d: got %q want %q", c.desired, c.ready, got, c.want)
			}
		})
	}
}

func TestDeriveClusterTerminating(t *testing.T) {
	c := cluster(1, 1)
	now := metav1.Now()
	c.SetDeletionTimestamp(&now)
	if got := deriveCluster(c).State; got != StateTerminating {
		t.Fatalf("got %q want %q", got, StateTerminating)
	}
}

func dep(slug string, desired, ready int32) *appsv1.Deployment {
	d := &appsv1.Deployment{}
	d.Labels = map[string]string{k8s.LabelResource: slug}
	d.Spec.Replicas = &desired
	d.Status.ReadyReplicas = ready
	return d
}

func podWaiting(slug, reason string) *corev1.Pod {
	p := &corev1.Pod{}
	p.Labels = map[string]string{k8s.LabelResource: slug}
	p.Status.ContainerStatuses = []corev1.ContainerStatus{
		{State: corev1.ContainerState{Waiting: &corev1.ContainerStateWaiting{Reason: reason}}},
	}
	return p
}

func TestDerive(t *testing.T) {
	tests := []struct {
		name string
		d    *appsv1.Deployment
		pods []*corev1.Pod
		want string
	}{
		{"all ready → running", dep("a", 3, 3), nil, StateRunning},
		{"partial → degraded", dep("a", 3, 1), nil, StateDegraded},
		{"zero desired → stopped", dep("a", 0, 0), nil, StateStopped},
		{"none ready, scheduling → pending", dep("a", 1, 0), nil, StatePending},
		{
			"crashloop outranks ready count → failed",
			dep("a", 1, 1),
			[]*corev1.Pod{podWaiting("a", "CrashLoopBackOff")},
			StateFailed,
		},
		{
			"image pull → failed",
			dep("a", 2, 0),
			[]*corev1.Pod{podWaiting("a", "ImagePullBackOff")},
			StateFailed,
		},
		{
			"benign waiting stays pending",
			dep("a", 1, 0),
			[]*corev1.Pod{podWaiting("a", "ContainerCreating")},
			StatePending,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := derive(tt.d, tt.pods).State
			if got != tt.want {
				t.Fatalf("derive = %q, want %q", got, tt.want)
			}
		})
	}
}

func sts(slug string, desired, ready int32) *appsv1.StatefulSet {
	s := &appsv1.StatefulSet{}
	s.Labels = map[string]string{k8s.LabelResource: slug}
	s.Spec.Replicas = &desired
	s.Status.ReadyReplicas = ready
	return s
}

func TestStatefulSetStatus(t *testing.T) {
	out := statusesFrom(nil, []*appsv1.StatefulSet{sts("cache", 1, 1)}, nil)
	if out["cache"].State != StateRunning {
		t.Fatalf("cache = %q, want running", out["cache"].State)
	}
	out = statusesFrom(nil, []*appsv1.StatefulSet{sts("cache", 1, 0)}, nil)
	if out["cache"].State != StatePending {
		t.Fatalf("cache = %q, want pending", out["cache"].State)
	}
}

func TestStatusesFromGroupsBySlug(t *testing.T) {
	deps := []*appsv1.Deployment{dep("api", 1, 1), dep("worker", 2, 0)}
	pods := []*corev1.Pod{podWaiting("worker", "CrashLoopBackOff")}

	got := statusesFrom(deps, nil, pods)
	if got["api"].State != StateRunning {
		t.Errorf("api = %q, want running", got["api"].State)
	}
	// worker's crashloop pod must not bleed into api's derivation.
	if got["worker"].State != StateFailed {
		t.Errorf("worker = %q, want failed", got["worker"].State)
	}
}

func TestTerminating(t *testing.T) {
	d := dep("a", 1, 1)
	now := d.CreationTimestamp // zero value reuse avoids importing metav1 time
	d.DeletionTimestamp = &now
	if got := derive(d, nil).State; got != StateTerminating {
		t.Fatalf("derive = %q, want terminating", got)
	}
}
