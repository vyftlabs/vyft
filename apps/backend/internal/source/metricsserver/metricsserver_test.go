package metricsserver

import (
	"context"
	"testing"

	"github.com/google/uuid"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	k8stesting "k8s.io/client-go/testing"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
	metricsfake "k8s.io/metrics/pkg/client/clientset/versioned/fake"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/source"
)

// newFakeClient returns a fake metrics clientset that serves the given
// PodMetrics list as the result of List() against the pods resource.
// Mirrors what real list calls do — fake's tracker-by-GVR doesn't
// automatically populate the v1beta1 "pods" resource for PodMetrics so we
// install a list reactor.
func newFakeClient(items []metricsv1beta1.PodMetrics) *metricsfake.Clientset {
	cs := metricsfake.NewSimpleClientset()
	cs.PrependReactor("list", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
		list := &metricsv1beta1.PodMetricsList{Items: items}
		return true, list, nil
	})
	return cs
}

func TestQuery_AggregatesCPUAndMemoryAcrossPodsAndContainers(t *testing.T) {
	ns := "vyft-demo-production"
	resourceName := "nginx"

	items := []metricsv1beta1.PodMetrics{
		{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "nginx-aaa",
				Namespace: ns,
				Labels:    map[string]string{"vyft.dev/resource": resourceName},
			},
			Containers: []metricsv1beta1.ContainerMetrics{
				{
					Name: "nginx",
					Usage: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("100m"),
						corev1.ResourceMemory: resource.MustParse("64Mi"),
					},
				},
			},
		},
		{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "nginx-bbb",
				Namespace: ns,
				Labels:    map[string]string{"vyft.dev/resource": resourceName},
			},
			Containers: []metricsv1beta1.ContainerMetrics{
				{
					Name: "nginx",
					Usage: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("50m"),
						corev1.ResourceMemory: resource.MustParse("32Mi"),
					},
				},
				{
					Name: "sidecar",
					Usage: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("25m"),
						corev1.ResourceMemory: resource.MustParse("16Mi"),
					},
				},
			},
		},
	}

	mcs := newFakeClient(items)
	ms := New(uuid.New(), "metrics-server", mcs)

	sel := source.ResourceSelector{Namespace: ns, ResourceName: resourceName}

	cpu, err := ms.Query(context.Background(), openapi.MetricKindCpu, sel, source.DefaultRange)
	if err != nil {
		t.Fatalf("cpu query: %v", err)
	}
	if len(cpu.Points) != 1 {
		t.Fatalf("cpu: got %d points, want 1", len(cpu.Points))
	}
	if want := float64(175); cpu.Points[0].Value != want {
		t.Errorf("cpu: got %v, want %v millicores", cpu.Points[0].Value, want)
	}

	mem, err := ms.Query(context.Background(), openapi.MetricKindMemory, sel, source.DefaultRange)
	if err != nil {
		t.Fatalf("memory query: %v", err)
	}
	if len(mem.Points) != 1 {
		t.Fatalf("memory: got %d points, want 1", len(mem.Points))
	}
	if want := float64((64 + 32 + 16) * 1024 * 1024); mem.Points[0].Value != want {
		t.Errorf("memory: got %v, want %v bytes", mem.Points[0].Value, want)
	}
}

func TestSupports_ReturnsCPUAndMemoryOnly(t *testing.T) {
	ms := New(uuid.New(), "metrics-server", metricsfake.NewSimpleClientset())
	got := ms.Supports()
	if len(got) != 2 {
		t.Fatalf("got %d kinds, want 2", len(got))
	}
	want := map[openapi.MetricKind]bool{openapi.MetricKindCpu: true, openapi.MetricKindMemory: true}
	for _, k := range got {
		if !want[k] {
			t.Errorf("unexpected kind: %s", k)
		}
	}
}

func TestProbeMetricNames_IsNilForAllKinds(t *testing.T) {
	ms := New(uuid.New(), "metrics-server", metricsfake.NewSimpleClientset())
	for _, k := range []openapi.MetricKind{
		openapi.MetricKindCpu,
		openapi.MetricKindMemory,
		openapi.MetricKindReqRate,
		openapi.MetricKindErrRate,
		openapi.MetricKindLatency,
	} {
		if got := ms.ProbeMetricNames(k); got != nil {
			t.Errorf("kind %s: ProbeMetricNames returned %v, want nil", k, got)
		}
	}
}

func TestQuery_RejectsUnsupportedKind(t *testing.T) {
	ms := New(uuid.New(), "metrics-server", metricsfake.NewSimpleClientset())
	sel := source.ResourceSelector{Namespace: "x", ResourceName: "y"}
	_, err := ms.Query(context.Background(), openapi.MetricKindReqRate, sel, source.DefaultRange)
	if err == nil {
		t.Fatal("expected error for unsupported kind, got nil")
	}
}
