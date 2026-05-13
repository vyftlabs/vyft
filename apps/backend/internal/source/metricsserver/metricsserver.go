// Package metricsserver implements the source interface against the
// in-cluster metrics-server (metrics.k8s.io). Returns instantaneous CPU
// and memory samples — time series accumulation happens in the web
// client.
package metricsserver

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/source"
)

const Kind = "metrics_server"

type MetricsServer struct {
	id   uuid.UUID
	name string
	mcs  metricsclient.Interface
}

func New(id uuid.UUID, name string, mcs metricsclient.Interface) *MetricsServer {
	return &MetricsServer{id: id, name: name, mcs: mcs}
}

func (m *MetricsServer) ID() uuid.UUID { return m.id }
func (m *MetricsServer) Kind() string  { return Kind }

func (m *MetricsServer) Supports() []openapi.MetricKind {
	return []openapi.MetricKind{
		openapi.MetricKindCpu,
		openapi.MetricKindMemory,
	}
}

// ProbeMetricNames returns nil for every kind — metrics-server detection
// is static (CPU/Memory always available when the source is reachable).
func (m *MetricsServer) ProbeMetricNames(_ openapi.MetricKind) []string {
	return nil
}

func (m *MetricsServer) Query(ctx context.Context, kind openapi.MetricKind, sel source.ResourceSelector, r source.Range) (source.Series, error) {
	switch kind {
	case openapi.MetricKindCpu, openapi.MetricKindMemory:
		// continue
	default:
		return source.Series{}, fmt.Errorf("metrics-server does not support kind %q", kind)
	}

	list, err := m.mcs.MetricsV1beta1().PodMetricses(sel.Namespace).List(ctx, metav1.ListOptions{
		LabelSelector: sel.PodLabelSelector(),
	})
	if err != nil {
		return source.Series{}, fmt.Errorf("metrics-server list: %w", err)
	}

	// No pods matched the selector — return an empty Series so the web
	// client renders the "no-data-in-range" / "service-not-instrumented"
	// empty state instead of a misleading 0.00 reading.
	if len(list.Items) == 0 {
		return source.Series{Kind: kind, Range: r, Points: nil}, nil
	}

	var totalMilli int64
	var totalBytes int64
	for _, pm := range list.Items {
		for _, c := range pm.Containers {
			totalMilli += c.Usage.Cpu().MilliValue()
			totalBytes += c.Usage.Memory().Value()
		}
	}

	// Snap timestamp to the step boundary so per-kind fetches that fire
	// at slightly different wall-clock moments share an X-axis position.
	point := source.Point{Time: time.Now().UTC().Truncate(r.Step())}
	switch kind {
	case openapi.MetricKindCpu:
		point.Value = float64(totalMilli)
	case openapi.MetricKindMemory:
		point.Value = float64(totalBytes)
	}

	return source.Series{
		Kind:   kind,
		Range:  r,
		Points: []source.Point{point},
	}, nil
}
