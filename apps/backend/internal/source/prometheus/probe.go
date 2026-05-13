package prometheus

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/prometheus/common/model"
)

// Probe runs a single combined Prom query that asks which of the given
// metric names exist. Returns map[name]bool; missing entries mean the
// name has no series. One round-trip regardless of input length.
func (p *Prometheus) Probe(ctx context.Context, metricNames []string) (map[string]bool, error) {
	if len(metricNames) == 0 {
		return map[string]bool{}, nil
	}
	query := fmt.Sprintf(`count by (__name__) ({__name__=~"%s"})`, strings.Join(metricNames, "|"))
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
