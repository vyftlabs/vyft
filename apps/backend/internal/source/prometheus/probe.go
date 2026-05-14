package prometheus

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/prometheus/common/model"

	"github.com/vyftlabs/vyft/apps/backend/internal/source"
)

// Probe checks which of the given metric names exist for the resource
// identified by sel. An empty selector skips the label filter — used for
// raw connectivity probes (e.g. the `up` metric during source-test).
//
// Metric names span two label conventions (cAdvisor uses namespace/pod;
// OTel semconv uses k8s_namespace_name/k8s_pod_name), so the probe may
// fan out to two round-trips. Results are merged.
func (p *Prometheus) Probe(ctx context.Context, sel source.ResourceSelector, metricNames []string) (map[string]bool, error) {
	if len(metricNames) == 0 {
		return map[string]bool{}, nil
	}
	if sel.Namespace == "" && sel.ResourceName == "" {
		return p.probeGroup(ctx, metricNames, "")
	}
	var cadvisor, semconv []string
	for _, n := range metricNames {
		if isSemconvMetric(n) {
			semconv = append(semconv, n)
			continue
		}
		cadvisor = append(cadvisor, n)
	}
	out := map[string]bool{}
	if len(cadvisor) > 0 {
		filter := fmt.Sprintf(`namespace="%s",pod=~"%s-.*"`, sel.Namespace, sel.ResourceName)
		hits, err := p.probeGroup(ctx, cadvisor, filter)
		if err != nil {
			return nil, err
		}
		for k, v := range hits {
			out[k] = v
		}
	}
	if len(semconv) > 0 {
		filter := fmt.Sprintf(`k8s_namespace_name="%s",k8s_pod_name=~"%s-.*"`, sel.Namespace, sel.ResourceName)
		hits, err := p.probeGroup(ctx, semconv, filter)
		if err != nil {
			return nil, err
		}
		for k, v := range hits {
			out[k] = v
		}
	}
	return out, nil
}

// probeGroup runs one `count by (__name__)` round-trip for a homogeneous
// set of metric names sharing the same label convention. labelFilter is
// the PromQL fragment after __name__ (may be empty).
func (p *Prometheus) probeGroup(ctx context.Context, names []string, labelFilter string) (map[string]bool, error) {
	selector := fmt.Sprintf(`__name__=~"%s"`, strings.Join(names, "|"))
	if labelFilter != "" {
		selector += "," + labelFilter
	}
	query := fmt.Sprintf(`count by (__name__) ({%s})`, selector)
	val, _, err := p.api.Query(ctx, query, time.Now())
	if err != nil {
		return nil, fmt.Errorf("prometheus probe: %w", err)
	}
	vec, ok := val.(model.Vector)
	if !ok {
		return nil, fmt.Errorf("prometheus probe: unexpected result type %T", val)
	}
	out := make(map[string]bool, len(vec))
	for _, sample := range vec {
		name := string(sample.Metric["__name__"])
		out[name] = true
	}
	return out, nil
}

// isSemconvMetric reports whether a probe metric name lives in the OTel
// HTTP server semantic convention namespace. Drives the label-filter
// split inside Probe. Kept narrow on purpose — every metric we probe is
// listed in queries.go, so an unknown name defaults to cAdvisor labels.
func isSemconvMetric(name string) bool {
	return strings.HasPrefix(name, "http_server_")
}
