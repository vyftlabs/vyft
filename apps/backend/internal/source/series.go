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

// PodSeries carries one pod's timeline for a kind that supports
// per-pod breakdown (CPU + Memory today). Sum across ByPod equals the
// aggregate Points.
type PodSeries struct {
	Pod    string
	Points []Point
}

// Series is what a source returns from a single Query. Either Points or
// Latency is populated based on Kind. Empty slices are valid (empty-data
// state on the UI). Limit is meaningful only for CPU + Memory and
// represents the aggregated pod limit (millicores / bytes) at fetch
// time; zero means "limit unknown / not set" and the UI falls back to
// raw display. ByPod is the per-pod breakdown for CPU + Memory; nil
// when the source can't produce it (metrics-server).
type Series struct {
	Kind    openapi.MetricKind
	Range   Range
	Points  []Point
	Latency []LatencyPoint
	Limit   float64
	ByPod   []PodSeries
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
