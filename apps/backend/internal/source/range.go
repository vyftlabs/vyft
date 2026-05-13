package source

import (
	"fmt"
	"time"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
)

// Range is the operator-selectable time window. Use ParseRange to coerce a
// string (e.g. URL query value) to a Range; Duration returns the window,
// Step the canonical query resolution for the window.
type Range openapi.MetricRange

const DefaultRange Range = "15m"

func ParseRange(s string) (Range, error) {
	if s == "" {
		return DefaultRange, nil
	}
	r := Range(s)
	switch openapi.MetricRange(r) {
	case "15m", "1h", "6h", "24h":
		return r, nil
	}
	return "", fmt.Errorf("invalid metric range: %q", s)
}

func (r Range) Duration() time.Duration {
	switch openapi.MetricRange(r) {
	case "1h":
		return time.Hour
	case "6h":
		return 6 * time.Hour
	case "24h":
		return 24 * time.Hour
	default:
		return 15 * time.Minute
	}
}

func (r Range) Step() time.Duration {
	switch openapi.MetricRange(r) {
	case "1h":
		return time.Minute
	case "6h":
		return 2 * time.Minute
	case "24h":
		return 5 * time.Minute
	default:
		return 15 * time.Second
	}
}

func (r Range) OpenAPI() openapi.MetricRange { return openapi.MetricRange(r) }
