package k8s

import (
	"github.com/google/uuid"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	appsv1ac "k8s.io/client-go/applyconfigurations/apps/v1"
	corev1ac "k8s.io/client-go/applyconfigurations/core/v1"
	netv1ac "k8s.io/client-go/applyconfigurations/networking/v1"

	"github.com/vyftlabs/vyft/apps/backend/internal/connref"
	"github.com/vyftlabs/vyft/apps/backend/internal/deployment"
)

// Manifests is the typed bundle Build returns. One slice per kind. The
// Apply path SSAs each in a known order; the prune path uses the union
// of names per GVR to decide what to delete.
type Manifests struct {
	Deployments []*appsv1ac.DeploymentApplyConfiguration
	Services    []*corev1ac.ServiceApplyConfiguration
	PVCs        []*corev1ac.PersistentVolumeClaimApplyConfiguration
	Ingresses   []*netv1ac.IngressApplyConfiguration
	Secrets     []*corev1ac.SecretApplyConfiguration
	// Clusters are CloudNativePG Cluster CRs (unstructured — a CRD, not a
	// core type). Applied + pruned via the dynamic client. omitempty keeps it
	// out of the manifest YAML for the common no-postgres case.
	Clusters []*unstructured.Unstructured `json:",omitempty"`
	// ScheduledBackups are CNPG ScheduledBackup CRs (one per backup-enabled
	// postgres). Same dynamic apply/prune path as Clusters.
	ScheduledBackups []*unstructured.Unstructured `json:",omitempty"`
	// RedisCRs are OT redis-operator Redis CRs (one per redis resource). The
	// operator owns the StatefulSet/Services/PVC it spawns.
	RedisCRs []*unstructured.Unstructured `json:",omitempty"`
	// PodMonitors are Prometheus-operator PodMonitor CRs (e.g. to scrape a
	// redis_exporter sidecar). Dynamic apply/prune.
	PodMonitors []*unstructured.Unstructured `json:",omitempty"`
}

// Build is pure: (Project, State) → typed ApplyConfigurations. No I/O.
//
// State is pre-filtered to one environment by the caller — Variables, Routes
// and ResourceVariables are env-scoped before they get here.
func Build(p deployment.Project, s deployment.State) Manifests {
	var m Manifests

	// Per-resource: own + imported variables, then the kind-specific build.
	for _, r := range s.Resources {
		rvars := varsForResource(s.Variables, s.ResourceVariables, r.ID)
		switch r.Kind {
		case "app":
			buildApp(&m, p, r, rvars)
		case "postgres":
			buildPostgres(&m, p, r)
		case "redis":
			buildRedis(&m, p, r, rvars)
			// future kinds: worker, cron, template
		}
	}

	for _, rt := range s.Routes {
		// Look up the owning resource so we can name and label per-resource.
		var owner *deployment.Resource
		for i := range s.Resources {
			if s.Resources[i].ID == rt.ResourceID {
				owner = &s.Resources[i]
				break
			}
		}
		if owner == nil {
			continue // route references a resource that doesn't exist; skip
		}
		buildRoute(&m, p, *owner, rt)
	}

	buildRegistries(&m, p, s.Registries)

	return m
}

// varsForResource returns the resolved env entries for one resource: its own
// variables (resource_id == r.ID) plus imports. Shared (project-level) vars
// are not auto-injected — apps that want a shared var declare an import.
func varsForResource(vars []deployment.Variable, imports []deployment.ResourceVariable, resourceID uuid.UUID) []resolvedVar {
	out := make([]resolvedVar, 0)

	// Owned vars: every variable whose resource_id equals this resource's id.
	for _, v := range vars {
		if v.ResourceID != nil && *v.ResourceID == resourceID {
			out = append(out, resolveVar(v.Key, v.Value, v.Secret))
		}
	}

	// Imports: look up the source variable by id and project under the
	// importer's chosen key.
	for _, imp := range imports {
		if imp.ResourceID != resourceID {
			continue
		}
		for _, v := range vars {
			if v.ID == imp.VariableID {
				out = append(out, resolveVar(imp.Key, v.Value, v.Secret))
				break
			}
		}
	}
	return out
}

// resolveVar turns a stored variable into an env-resolution result. A
// secret-ref sentinel value (postgres connection vars) becomes a reference to
// an external secret; everything else carries its literal value.
func resolveVar(key, value string, secret bool) resolvedVar {
	if name, sk, ok := connref.Parse(value); ok {
		return resolvedVar{Key: key, SecretName: name, SecretKey: sk}
	}
	return resolvedVar{Key: key, Value: value, Secret: secret}
}

// resolvedVar is the env-resolution result handed to buildApp. When SecretName
// is set the env is rendered as a secretKeyRef to that external secret (and
// Value/Secret are unused); otherwise Secret picks inline-value vs the app's
// own env Secret.
type resolvedVar struct {
	Key        string
	Value      string
	Secret     bool
	SecretName string
	SecretKey  string
}

// knownNames groups manifest names by kind for the prune step.
type knownNames struct {
	deployments      map[string]struct{}
	services         map[string]struct{}
	pvcs             map[string]struct{}
	ingresses        map[string]struct{}
	secrets          map[string]struct{}
	clusters         map[string]struct{}
	scheduledBackups map[string]struct{}
	redisCRs         map[string]struct{}
	podMonitors      map[string]struct{}
}

func collectKnown(m Manifests) knownNames {
	k := knownNames{
		deployments:      map[string]struct{}{},
		services:         map[string]struct{}{},
		pvcs:             map[string]struct{}{},
		ingresses:        map[string]struct{}{},
		secrets:          map[string]struct{}{},
		clusters:         map[string]struct{}{},
		scheduledBackups: map[string]struct{}{},
		redisCRs:         map[string]struct{}{},
		podMonitors:      map[string]struct{}{},
	}
	for _, d := range m.Deployments {
		if d.Name != nil {
			k.deployments[*d.Name] = struct{}{}
		}
	}
	for _, s := range m.Services {
		if s.Name != nil {
			k.services[*s.Name] = struct{}{}
		}
	}
	for _, p := range m.PVCs {
		if p.Name != nil {
			k.pvcs[*p.Name] = struct{}{}
		}
	}
	for _, i := range m.Ingresses {
		if i.Name != nil {
			k.ingresses[*i.Name] = struct{}{}
		}
	}
	for _, s := range m.Secrets {
		if s.Name != nil {
			k.secrets[*s.Name] = struct{}{}
		}
	}
	for _, c := range m.Clusters {
		k.clusters[c.GetName()] = struct{}{}
	}
	for _, sb := range m.ScheduledBackups {
		k.scheduledBackups[sb.GetName()] = struct{}{}
	}
	for _, rc := range m.RedisCRs {
		k.redisCRs[rc.GetName()] = struct{}{}
	}
	for _, pm := range m.PodMonitors {
		k.podMonitors[pm.GetName()] = struct{}{}
	}
	return k
}
