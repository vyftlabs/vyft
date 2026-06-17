package source

// MetricKind is the internal identifier for one metrics endpoint family.
// Wire-side, kind is encoded by URL path, not as a payload field.
type MetricKind string

const (
	KindCpu         MetricKind = "cpu"
	KindMemory      MetricKind = "memory"
	KindDisk        MetricKind = "disk"
	KindNetwork     MetricKind = "network"
	KindRequestRate MetricKind = "requestRate"
	KindErrorRate   MetricKind = "errorRate"
	KindLatency     MetricKind = "latency"
	// Postgres (CNPG) database metrics.
	KindConnections  MetricKind = "connections"
	KindTransactions MetricKind = "transactions"
	KindCacheHit       MetricKind = "cacheHit"
	KindDbSize         MetricKind = "dbSize"
	KindReplicationLag MetricKind = "replicationLag"
	// Redis (redis_exporter) metrics.
	KindRedisMemory  MetricKind = "redisMemory"
	KindRedisClients MetricKind = "redisClients"
	KindRedisOps     MetricKind = "redisOps"
)
