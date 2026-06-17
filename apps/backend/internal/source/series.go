package source

import "time"

// ResourcePoint is one sample for cpu/memory. Value is in canonical units
// (cores or bytes). Limit/Request track the configured resource cap at
// the time of the sample; zero means "not configured" and the wire JSON
// omits the field.
type ResourcePoint struct {
	Time    time.Time
	Value   float64
	Limit   float64
	Request float64
}

// RatePoint is one sample for request rate or error rate. Rates in
// canonical units: requests/second (req rate) or fraction 0..1 (err rate).
type RatePoint struct {
	Time  time.Time
	Value float64
}

// LatencyPoint carries all three quantiles for one timestamp. Seconds.
type LatencyPoint struct {
	Time time.Time
	P50  float64
	P95  float64
	P99  float64
}

// NetworkPoint carries both directions for one timestamp, bytes/second.
type NetworkPoint struct {
	Time time.Time
	Rx   float64
	Tx   float64
}

// ResourceSeries is per-pod for cpu/memory. ID is the pod name; empty
// string means "aggregate" (used by sources that can't break down by pod).
type ResourceSeries struct {
	ID     string
	Points []ResourcePoint
}

// RateSeries is the single aggregate timeline for req/err rates. ID is
// kept for symmetry with ResourceSeries but is currently always empty.
type RateSeries struct {
	ID     string
	Points []RatePoint
}

// LatencySeries is the single aggregate quantile timeline. ID always empty.
type LatencySeries struct {
	ID     string
	Points []LatencyPoint
}

// NetworkSeries is per-pod throughput. ID is the pod name.
type NetworkSeries struct {
	ID     string
	Points []NetworkPoint
}
