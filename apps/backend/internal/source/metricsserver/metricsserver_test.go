package metricsserver

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	k8stesting "k8s.io/client-go/testing"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
	metricsfake "k8s.io/metrics/pkg/client/clientset/versioned/fake"

	"github.com/vyftlabs/vyft/apps/backend/internal/source"
)

func newFakeClient(items []metricsv1beta1.PodMetrics) *metricsfake.Clientset {
	cs := metricsfake.NewSimpleClientset()
	cs.PrependReactor("list", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &metricsv1beta1.PodMetricsList{Items: items}, nil
	})
	return cs
}

func tr() source.TimeRange {
	now := time.Now().UTC()
	return source.TimeRange{From: now.Add(-15 * time.Minute), To: now}
}

func TestQueryResource_EmitsOneSeriesPerPod(t *testing.T) {
	ns := "vyft-demo-production"
	resourceName := "nginx"

	items := []metricsv1beta1.PodMetrics{
		{
			ObjectMeta: metav1.ObjectMeta{
				Name: "nginx-aaa", Namespace: ns,
				Labels: map[string]string{"vyft.dev/resource": resourceName},
			},
			Containers: []metricsv1beta1.ContainerMetrics{
				{Name: "nginx", Usage: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("100m"),
					corev1.ResourceMemory: resource.MustParse("64Mi"),
				}},
			},
		},
		{
			ObjectMeta: metav1.ObjectMeta{
				Name: "nginx-bbb", Namespace: ns,
				Labels: map[string]string{"vyft.dev/resource": resourceName},
			},
			Containers: []metricsv1beta1.ContainerMetrics{
				{Name: "nginx", Usage: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("50m"),
					corev1.ResourceMemory: resource.MustParse("32Mi"),
				}},
				{Name: "sidecar", Usage: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("25m"),
					corev1.ResourceMemory: resource.MustParse("16Mi"),
				}},
			},
		},
	}

	mcs := newFakeClient(items)
	ms := New(uuid.New(), "metrics-server", mcs)
	sel := source.ResourceSelector{Namespace: ns, ResourceName: resourceName}

	cpu, err := ms.QueryResource(context.Background(), source.KindCpu, sel, tr())
	if err != nil {
		t.Fatalf("cpu: %v", err)
	}
	if len(cpu) != 2 {
		t.Fatalf("cpu: got %d series, want 2", len(cpu))
	}

	// Pod aaa has 100m → 0.1 cores. Pod bbb has 50m+25m → 0.075 cores.
	for _, s := range cpu {
		if len(s.Points) != 1 {
			t.Fatalf("pod %s: got %d points, want 1", s.ID, len(s.Points))
		}
		switch s.ID {
		case "nginx-aaa":
			if got, want := s.Points[0].Value, 0.1; got != want {
				t.Errorf("nginx-aaa cpu: got %v, want %v cores", got, want)
			}
		case "nginx-bbb":
			if got, want := s.Points[0].Value, 0.075; got != want {
				t.Errorf("nginx-bbb cpu: got %v, want %v cores", got, want)
			}
		default:
			t.Errorf("unexpected pod id: %s", s.ID)
		}
	}

	mem, err := ms.QueryResource(context.Background(), source.KindMemory, sel, tr())
	if err != nil {
		t.Fatalf("memory: %v", err)
	}
	if len(mem) != 2 {
		t.Fatalf("memory: got %d series, want 2", len(mem))
	}
}

func TestSupports_ReturnsCPUAndMemoryOnly(t *testing.T) {
	ms := New(uuid.New(), "metrics-server", metricsfake.NewSimpleClientset())
	got := ms.Supports()
	if len(got) != 2 {
		t.Fatalf("got %d kinds, want 2", len(got))
	}
	want := map[source.MetricKind]bool{source.KindCpu: true, source.KindMemory: true}
	for _, k := range got {
		if !want[k] {
			t.Errorf("unexpected kind: %s", k)
		}
	}
}

func TestProbeMetricNames_IsNilForAllKinds(t *testing.T) {
	ms := New(uuid.New(), "metrics-server", metricsfake.NewSimpleClientset())
	for _, k := range []source.MetricKind{
		source.KindCpu, source.KindMemory,
		source.KindRequestRate, source.KindErrorRate, source.KindLatency,
	} {
		if got := ms.ProbeMetricNames(k); got != nil {
			t.Errorf("kind %s: ProbeMetricNames returned %v, want nil", k, got)
		}
	}
}

func TestQueryRate_RejectsUnsupportedKind(t *testing.T) {
	ms := New(uuid.New(), "metrics-server", metricsfake.NewSimpleClientset())
	sel := source.ResourceSelector{Namespace: "x", ResourceName: "y"}
	_, err := ms.QueryRate(context.Background(), source.KindRequestRate, sel, tr())
	if err == nil {
		t.Fatal("expected error for unsupported kind, got nil")
	}
}
