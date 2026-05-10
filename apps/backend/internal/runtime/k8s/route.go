package k8s

import (
	"crypto/sha1"
	"encoding/hex"

	netv1 "k8s.io/api/networking/v1"
	netv1ac "k8s.io/client-go/applyconfigurations/networking/v1"

	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
)

// buildRoute emits one Ingress per route. Naming uses the owning resource
// name + a short hash of (domain,path) to keep names DNS-1123 short and
// unique even when one resource has multiple routes.
func buildRoute(m *Manifests, p deployment.Project, owner deployment.Resource, r deployment.Route) {
	pathType := netv1.PathTypePrefix
	if r.PathType == "exact" {
		pathType = netv1.PathTypeExact
	}

	rule := netv1ac.IngressRule().
		WithHost(r.Domain).
		WithHTTP(netv1ac.HTTPIngressRuleValue().
			WithPaths(netv1ac.HTTPIngressPath().
				WithPath(r.Path).
				WithPathType(pathType).
				WithBackend(netv1ac.IngressBackend().
					WithService(netv1ac.IngressServiceBackend().
						WithName(owner.Name).
						WithPort(netv1ac.ServiceBackendPort().
							WithNumber(r.Port))))))

	spec := netv1ac.IngressSpec().WithRules(rule)
	if r.TLS {
		spec.WithTLS(netv1ac.IngressTLS().
			WithHosts(r.Domain).
			WithSecretName(owner.Name + "-tls"))
	}

	name := routeIngressName(owner.Name, r.Domain, r.Path)
	ing := netv1ac.Ingress(name, "").
		WithLabels(stdLabels(p, owner.Name)).
		WithSpec(spec)
	m.Ingresses = append(m.Ingresses, ing)
}

// routeIngressName returns a stable DNS-1123 name combining resource name +
// short hash of (domain,path). Length-bounded for k8s 63-char limit.
func routeIngressName(resource, domain, path string) string {
	h := sha1.Sum([]byte(domain + path))
	suffix := hex.EncodeToString(h[:4]) // 8 chars
	return resource + "-" + suffix
}
