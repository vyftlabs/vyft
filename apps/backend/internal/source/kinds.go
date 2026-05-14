package source

// MetricKind is the internal identifier for one metrics endpoint family.
// Wire-side, kind is encoded by URL path, not as a payload field.
type MetricKind string

const (
	KindCpu         MetricKind = "cpu"
	KindMemory      MetricKind = "memory"
	KindRequestRate MetricKind = "requestRate"
	KindErrorRate   MetricKind = "errorRate"
	KindLatency     MetricKind = "latency"
)
