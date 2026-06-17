package observability

import "time"

// fillGrid reindexes time-sorted points onto the exact query step grid,
// spanning the first sample to the last. We asked Prometheus for a regular
// `step` grid; it returns only the steps it had a sample for, so a data hole
// is an *absent* row — and a chart with nothing to anchor on bridges
// straight across it. fillGrid materializes the grid we requested: every
// step the source skipped becomes an explicit null point, which the chart
// renders as a real break (recharts connectNulls=false).
//
// It is faithful, not lossy: real samples pass through untouched and the
// only thing ever inserted is null. Only the span between the first and last
// real sample is filled — no leading/trailing padding — so single-sample
// sources (metrics-server) and windows with no data yet pass through as-is.
//
// ts extracts a point's epoch-ms; null builds an all-nil point at a given ms.
// Real sample timestamps are step-aligned (promRange truncates start to the
// step), so stepping from the first sample lands exactly on every real one.
func fillGrid[T any](points []T, step time.Duration, ts func(T) int, null func(ms int) T) []T {
	if len(points) < 2 || step <= 0 {
		return points
	}
	stepMs := int(step.Milliseconds())
	first, last := ts(points[0]), ts(points[len(points)-1])
	byTs := make(map[int]T, len(points))
	for _, p := range points {
		byTs[ts(p)] = p
	}
	out := make([]T, 0, (last-first)/stepMs+1)
	for t := first; t <= last; t += stepMs {
		if p, ok := byTs[t]; ok {
			out = append(out, p)
		} else {
			out = append(out, null(t))
		}
	}
	return out
}
