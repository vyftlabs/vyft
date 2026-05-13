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

// Validated against cAdvisor in a stock kube cluster.
const (
	cpuTmpl = `sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="{namespace}",pod=~"{resource}-.*",container!="POD",container!=""}[5m]))`

	memoryTmpl = `sum by (pod) (container_memory_working_set_bytes{namespace="{namespace}",pod=~"{resource}-.*",container!="POD",container!=""})`

	// Limits (cAdvisor). quota/period yields cores (multiply by 1000 to
	// get millicores). Pods without a CPU limit set report quota=-1 so
	// callers must filter > 0 before exposing.
	cpuLimitTmpl = `sum by (pod) (container_spec_cpu_quota{namespace="{namespace}",pod=~"{resource}-.*",container!="POD",container!=""} / container_spec_cpu_period{namespace="{namespace}",pod=~"{resource}-.*",container!="POD",container!=""})`

	// Memory limit (bytes). Pods without a memory limit report a huge
	// node-capacity value; callers should sanity-check before exposing.
	memoryLimitTmpl = `sum by (pod) (container_spec_memory_limit_bytes{namespace="{namespace}",pod=~"{resource}-.*",container!="POD",container!=""})`
)

// RED queries: semconv first (OTel HTTP server semantic conventions);
// legacy fallback (community http_requests_total) used only when the
// semconv query returns no series.
const (
	reqRateSemconv = `sum(rate(http_server_request_duration_seconds_count{namespace="{namespace}",pod=~"{resource}-.*"}[1m]))`
	reqRateLegacy  = `sum(rate(http_requests_total{namespace="{namespace}",pod=~"{resource}-.*"}[1m]))`

	errRateSemconv = `sum(rate(http_server_request_duration_seconds_count{namespace="{namespace}",pod=~"{resource}-.*",http_response_status_code=~"5.."}[1m])) / sum(rate(http_server_request_duration_seconds_count{namespace="{namespace}",pod=~"{resource}-.*"}[1m]))`
	errRateLegacy  = `sum(rate(http_requests_total{namespace="{namespace}",pod=~"{resource}-.*",status=~"5.."}[1m])) / sum(rate(http_requests_total{namespace="{namespace}",pod=~"{resource}-.*"}[1m]))`
)

// latencyQuantile returns the histogram_quantile query for q in [0,1].
func latencyQuantile(q float64) string {
	return fmt.Sprintf(
		`histogram_quantile(%g, sum by (le) (rate(http_server_request_duration_seconds_bucket{namespace="{namespace}",pod=~"{resource}-.*"}[1m])))`,
		q,
	)
}
