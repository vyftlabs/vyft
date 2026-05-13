package source

import (
	"time"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
)

// Point is a single sample for non-latency kinds (CPU, memory, request
// rate, error rate).
type Point struct {
	Time  time.Time
	Value float64
}

// LatencyPoint carries the three quantiles for one timestamp.
type LatencyPoint struct {
	Time time.Time
	P50  float64
	P95  float64
	P99  float64
}

// Series is what a source returns from a single Query. Either Points or
// Latency is populated based on Kind. Empty slices are valid (empty-data
// state on the UI).
type Series struct {
	Kind    openapi.MetricKind
	Range   Range
	Points  []Point
	Latency []LatencyPoint
}

// ToOpenAPIRangePoints converts the internal Point slice to the API
// representation, sorted by time.
func ToOpenAPIRangePoints(pts []Point) []openapi.RangePoint {
	out := make([]openapi.RangePoint, len(pts))
	for i, p := range pts {
		out[i] = openapi.RangePoint{Time: p.Time, Value: float32(p.Value)}
	}
	return out
}

// ToOpenAPILatencyPoints converts the internal LatencyPoint slice to the
// API representation.
func ToOpenAPILatencyPoints(pts []LatencyPoint) []openapi.LatencyPoint {
	out := make([]openapi.LatencyPoint, len(pts))
	for i, p := range pts {
		out[i] = openapi.LatencyPoint{
			Time: p.Time,
			P50:  float32(p.P50),
			P95:  float32(p.P95),
			P99:  float32(p.P99),
		}
	}
	return out
}
