package k8s

import (
	"context"
	"fmt"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/utils/ptr"
)

var (
	deploymentsGVR = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
	servicesGVR    = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}
	pvcsGVR        = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "persistentvolumeclaims"}
	ingressesGVR   = schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}
	secretsGVR     = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "secrets"}
	// CNPGClusterGVR is the CloudNativePG Cluster CRD. May be absent when the
	// operator isn't installed — apply/prune tolerate that.
	CNPGClusterGVR = schema.GroupVersionResource{Group: "postgresql.cnpg.io", Version: "v1", Resource: "clusters"}
	// CNPGScheduledBackupGVR is the CNPG ScheduledBackup CRD (cron-driven
	// backups). Same tolerance as the Cluster CRD.
	CNPGScheduledBackupGVR = schema.GroupVersionResource{Group: "postgresql.cnpg.io", Version: "v1", Resource: "scheduledbackups"}
	// CNPGBackupGVR is the CNPG Backup CRD (one per backup run, scheduled or
	// on-demand). Listed/created directly by the Backups tab.
	CNPGBackupGVR = schema.GroupVersionResource{Group: "postgresql.cnpg.io", Version: "v1", Resource: "backups"}
	// RedisGVR is the OT redis-operator Redis CRD (standalone). May be absent
	// when the operator isn't installed — apply/prune tolerate that.
	RedisGVR = schema.GroupVersionResource{Group: "redis.redis.opstreelabs.in", Version: "v1beta2", Resource: "redis"}
	// PodMonitorGVR is the Prometheus-operator PodMonitor CRD.
	PodMonitorGVR = schema.GroupVersionResource{Group: "monitoring.coreos.com", Version: "v1", Resource: "podmonitors"}
)

// applyAll SSAs every manifest in order: secrets → PVCs → deployments →
// services → ingresses. Order matters for first-create races: secrets and
// PVCs must exist before pods can mount them.
func applyAll(ctx context.Context, cs kubernetes.Interface, dyn dynamic.Interface, ns string, m Manifests) error {
	opts := metav1.ApplyOptions{FieldManager: FieldManager, Force: true}

	for _, s := range m.Secrets {
		if _, err := cs.CoreV1().Secrets(ns).Apply(ctx, s, opts); err != nil {
			return fmt.Errorf("apply secret %s: %w", deref(s.Name), err)
		}
	}
	for _, p := range m.PVCs {
		if _, err := cs.CoreV1().PersistentVolumeClaims(ns).Apply(ctx, p, opts); err != nil {
			return fmt.Errorf("apply pvc %s: %w", deref(p.Name), err)
		}
	}
	for _, d := range m.Deployments {
		if _, err := cs.AppsV1().Deployments(ns).Apply(ctx, d, opts); err != nil {
			return fmt.Errorf("apply deployment %s: %w", deref(d.Name), err)
		}
	}
	for _, s := range m.Services {
		if _, err := cs.CoreV1().Services(ns).Apply(ctx, s, opts); err != nil {
			return fmt.Errorf("apply service %s: %w", deref(s.Name), err)
		}
	}
	for _, i := range m.Ingresses {
		if _, err := cs.NetworkingV1().Ingresses(ns).Apply(ctx, i, opts); err != nil {
			return fmt.Errorf("apply ingress %s: %w", deref(i.Name), err)
		}
	}
	// CNPG Cluster CRs via the dynamic client (CRD, not a core type).
	for _, c := range m.Clusters {
		if _, err := dyn.Resource(CNPGClusterGVR).Namespace(ns).Apply(ctx, c.GetName(), c, opts); err != nil {
			return fmt.Errorf("apply cluster %s: %w", c.GetName(), err)
		}
	}
	// ScheduledBackup CRs, after their Cluster exists.
	for _, sb := range m.ScheduledBackups {
		if _, err := dyn.Resource(CNPGScheduledBackupGVR).Namespace(ns).Apply(ctx, sb.GetName(), sb, opts); err != nil {
			return fmt.Errorf("apply scheduledbackup %s: %w", sb.GetName(), err)
		}
	}
	// Redis CRs (OT operator owns the spawned StatefulSet/Services/PVC).
	for _, rc := range m.RedisCRs {
		if _, err := dyn.Resource(RedisGVR).Namespace(ns).Apply(ctx, rc.GetName(), rc, opts); err != nil {
			return fmt.Errorf("apply redis %s: %w", rc.GetName(), err)
		}
	}
	// PodMonitors (scrape config for exporter sidecars).
	for _, pm := range m.PodMonitors {
		if _, err := dyn.Resource(PodMonitorGVR).Namespace(ns).Apply(ctx, pm.GetName(), pm, opts); err != nil {
			return fmt.Errorf("apply podmonitor %s: %w", pm.GetName(), err)
		}
	}
	return nil
}

// pruneByLabel deletes objects in `ns` labeled vyft.dev/project=<slug> whose
// names aren't in the known set for that GVR. Foreground propagation so the
// caller sees a clean cluster after Apply returns.
func pruneByLabel(ctx context.Context, dyn dynamic.Interface, ns, slug string, known knownNames) error {
	selector := LabelProject + "=" + slug
	delOpts := metav1.DeleteOptions{
		PropagationPolicy: ptr.To(metav1.DeletePropagationForeground),
	}

	type pair struct {
		gvr   schema.GroupVersionResource
		known map[string]struct{}
		// tolerant skips this GVR when its type isn't registered (CRD absent),
		// instead of failing the whole prune. Used for the optional CNPG CRD.
		tolerant bool
	}
	for _, kp := range []pair{
		{deploymentsGVR, known.deployments, false},
		{servicesGVR, known.services, false},
		{pvcsGVR, known.pvcs, false},
		{ingressesGVR, known.ingresses, false},
		{secretsGVR, known.secrets, false},
		{CNPGScheduledBackupGVR, known.scheduledBackups, true},
		{CNPGClusterGVR, known.clusters, true},
		{RedisGVR, known.redisCRs, true},
		{PodMonitorGVR, known.podMonitors, true},
	} {
		list, err := dyn.Resource(kp.gvr).Namespace(ns).List(ctx, metav1.ListOptions{
			LabelSelector: selector,
		})
		if err != nil {
			if kp.tolerant && (meta.IsNoMatchError(err) || apierrors.IsNotFound(err)) {
				continue
			}
			return fmt.Errorf("prune list %s: %w", kp.gvr.Resource, err)
		}
		for _, obj := range list.Items {
			if _, keep := kp.known[obj.GetName()]; keep {
				continue
			}
			// Skip operator-managed children: an operator (e.g. OT redis) may
			// propagate our project label onto the StatefulSet/Services/PVC it
			// spawns. Those carry a controller ownerReference — we don't own
			// them, the operator does (it GCs them when its CR is deleted).
			if metav1.GetControllerOfNoCopy(&obj) != nil {
				continue
			}
			if err := dyn.Resource(kp.gvr).Namespace(ns).Delete(ctx, obj.GetName(), delOpts); err != nil {
				return fmt.Errorf("prune delete %s/%s: %w", kp.gvr.Resource, obj.GetName(), err)
			}
		}
	}
	return nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
