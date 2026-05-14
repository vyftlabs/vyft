package prometheus

import (
	"fmt"
	"strings"
)

// queryVars are the only knobs templates take.
type queryVars struct {
	Namespace string
	Resource  string
}

func expand(tmpl string, v queryVars) string {
	r := strings.NewReplacer(
		"{namespace}", v.Namespace,
		"{resource}", v.Resource,
	)
	return r.Replace(tmpl)
}

// Per-pod CPU/Memory templates. Frontend aggregates across series.
// Limit templates return a single `max()` scalar across pods. KSM is
// the source of truth; cAdvisor's container_spec_* is kept as a fallback
// for clusters without KSM.
const (
	cpuPerPodTmpl    = `sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="{namespace}",pod=~"{resource}-.*",container!="POD",container!=""}[5m]))`
	memoryPerPodTmpl = `sum by (pod) (container_memory_working_set_bytes{namespace="{namespace}",pod=~"{resource}-.*",container!="POD",container!=""})`

	cpuLimitTmpl    = `max(kube_pod_container_resource_limits{namespace="{namespace}",pod=~"{resource}-.*",resource="cpu"} or container_spec_cpu_quota{namespace="{namespace}",pod=~"{resource}-.*",container!="POD",container!="",container_spec_cpu_quota!="-1"} / container_spec_cpu_period{namespace="{namespace}",pod=~"{resource}-.*",container!="POD",container!=""})`
	memoryLimitTmpl = `max(kube_pod_container_resource_limits{namespace="{namespace}",pod=~"{resource}-.*",resource="memory"} or container_spec_memory_limit_bytes{namespace="{namespace}",pod=~"{resource}-.*",container!="POD",container!=""})`
)

// RED queries: semconv first (OTel HTTP server semantic conventions);
// legacy fallback (community http_requests_total) used only when the
// semconv query returns no series.
//
// Label convention split:
// - cAdvisor uses `namespace` + `pod`.
// - OTel / Beyla uses `k8s_namespace_name` + `k8s_pod_name`.
// CPU + Memory templates stay on cAdvisor labels; RED + Latency use OTel
// labels because that's what HTTP-instrumentation emitters tag with.
// Each query tail-pipes `or (sum(metric{labels}) * 0)`:
//  - rate has samples → real value
//  - metric exists for labels but no rate in window → 0 (idle zero-fill)
//  - metric never exists for labels → empty (UI renders "no data")
// Single round-trip distinguishes "supported but idle" from "unsupported".
const (
	reqRateSemconv = `sum(rate(http_server_request_duration_seconds_count{k8s_namespace_name="{namespace}",k8s_pod_name=~"{resource}-.*"}[1m])) or (sum(http_server_request_duration_seconds_count{k8s_namespace_name="{namespace}",k8s_pod_name=~"{resource}-.*"}) * 0)`
	reqRateLegacy  = `sum(rate(http_requests_total{namespace="{namespace}",pod=~"{resource}-.*"}[1m])) or (sum(http_requests_total{namespace="{namespace}",pod=~"{resource}-.*"}) * 0)`

	// Error rate. Same idle zero-fill via tail `or (sum(metric)*0)`.
	// Denominator `clamp_min(..., 1)` keeps 0/0 → 0 instead of NaN.
	errRateSemconv = `((sum(rate(http_server_request_duration_seconds_count{k8s_namespace_name="{namespace}",k8s_pod_name=~"{resource}-.*",http_response_status_code=~"5.."}[1m])) or vector(0)) / clamp_min(sum(rate(http_server_request_duration_seconds_count{k8s_namespace_name="{namespace}",k8s_pod_name=~"{resource}-.*"}[1m])), 1)) or (sum(http_server_request_duration_seconds_count{k8s_namespace_name="{namespace}",k8s_pod_name=~"{resource}-.*"}) * 0)`
	errRateLegacy  = `((sum(rate(http_requests_total{namespace="{namespace}",pod=~"{resource}-.*",status=~"5.."}[1m])) or vector(0)) / clamp_min(sum(rate(http_requests_total{namespace="{namespace}",pod=~"{resource}-.*"}[1m])), 1)) or (sum(http_requests_total{namespace="{namespace}",pod=~"{resource}-.*"}) * 0)`
)

// latencyQuantile returns the histogram_quantile query for q in [0,1].
// Tail `or (sum(bucket{labels})*0)` zero-fills idle windows when the
// metric exists for the resource.
func latencyQuantile(q float64) string {
	return fmt.Sprintf(
		`histogram_quantile(%g, sum by (le) (rate(http_server_request_duration_seconds_bucket{k8s_namespace_name="{namespace}",k8s_pod_name=~"{resource}-.*"}[1m]))) or (sum(http_server_request_duration_seconds_bucket{k8s_namespace_name="{namespace}",k8s_pod_name=~"{resource}-.*"}) * 0)`,
		q,
	)
}
