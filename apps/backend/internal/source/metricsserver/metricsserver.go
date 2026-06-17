// Package metricsserver implements the source interface against the
// in-cluster metrics-server (metrics.k8s.io). Each call returns a single
// instantaneous sample per pod — history accumulates across polls.
package metricsserver

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"

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

func (m *MetricsServer) Supports() []source.MetricKind {
	return []source.MetricKind{source.KindCpu, source.KindMemory}
}

// ProbeMetricNames returns nil for every kind — metrics-server detection
// is static (always-on when the source is reachable).
func (m *MetricsServer) ProbeMetricNames(_ source.MetricKind) []string { return nil }

// QueryResource serves cpu + memory. metrics-server is instantaneous, so
// returns one ResourcePoint per pod at the current step boundary.
func (m *MetricsServer) QueryResource(ctx context.Context, kind source.MetricKind, sel source.ResourceSelector, r source.TimeRange) ([]source.ResourceSeries, error) {
	switch kind {
	case source.KindCpu, source.KindMemory:
	default:
		return nil, fmt.Errorf("metrics-server does not support kind %q", kind)
	}

	list, err := m.mcs.MetricsV1beta1().PodMetricses(sel.Namespace).List(ctx, metav1.ListOptions{
		LabelSelector: sel.PodLabelSelector(),
	})
	if err != nil {
		return nil, fmt.Errorf("metrics-server list: %w", err)
	}
	if len(list.Items) == 0 {
		return nil, nil
	}

	// Snap to the step boundary so successive polls produce timestamps
	// that align with whatever step the caller picked.
	now := time.Now().UTC().Truncate(r.Step())

	out := make([]source.ResourceSeries, 0, len(list.Items))
	for _, pm := range list.Items {
		var total int64
		for _, c := range pm.Containers {
			switch kind {
			case source.KindCpu:
				// metrics-server CPU is in millicores; convert to canonical cores.
				total += c.Usage.Cpu().MilliValue()
			case source.KindMemory:
				total += c.Usage.Memory().Value()
			}
		}
		var value float64
		switch kind {
		case source.KindCpu:
			value = float64(total) / 1000 // millicores → cores
		case source.KindMemory:
			value = float64(total) // bytes
		}
		out = append(out, source.ResourceSeries{
			ID:     pm.Name,
			Points: []source.ResourcePoint{{Time: now, Value: value}},
		})
	}
	return out, nil
}

// QueryRate / QueryLatency: metrics-server doesn't serve RED or latency.
// These return errors that the handler maps to 404.

func (m *MetricsServer) QueryRate(_ context.Context, kind source.MetricKind, _ source.ResourceSelector, _ source.TimeRange) (source.RateSeries, error) {
	return source.RateSeries{}, fmt.Errorf("metrics-server does not support kind %q", kind)
}

func (m *MetricsServer) QueryLatency(_ context.Context, _ source.ResourceSelector, _ source.TimeRange) (source.LatencySeries, error) {
	return source.LatencySeries{}, fmt.Errorf("metrics-server does not support latency")
}

func (m *MetricsServer) QueryNetwork(_ context.Context, _ source.ResourceSelector, _ source.TimeRange) ([]source.NetworkSeries, error) {
	return nil, fmt.Errorf("metrics-server does not support network")
}
