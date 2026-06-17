// Package pgbackup reads and creates CloudNativePG Backup CRs for a postgres
// resource — the data behind the Backups tab (list + on-demand "back up now").
// CNPG labels every Backup (scheduled or manual) with cnpg.io/cluster, which is
// how they're associated with a cluster.
package pgbackup

import (
	"context"
	"sort"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/vyftlabs/vyft/apps/backend/internal/runtime/k8s"
)

// clusterLabel is CNPG's association label between a Backup and its Cluster.
const clusterLabel = "cnpg.io/cluster"

// Backup is the normalized view of a CNPG Backup CR's status.
type Backup struct {
	Name      string
	Phase     string
	BackupID  string
	Method    string
	Error     string
	StartedAt *time.Time
	StoppedAt *time.Time
}

// List returns a cluster's backups, newest first. Best-effort: nil dyn yields
// nil; the caller maps a missing CRD / read error to an empty list.
func List(ctx context.Context, dyn dynamic.Interface, namespace, cluster string) ([]Backup, error) {
	if dyn == nil {
		return nil, nil
	}
	list, err := dyn.Resource(k8s.CNPGBackupGVR).Namespace(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: clusterLabel + "=" + cluster,
	})
	if err != nil {
		return nil, err
	}
	out := make([]Backup, 0, len(list.Items))
	for i := range list.Items {
		out = append(out, convert(&list.Items[i]))
	}
	sort.Slice(out, func(i, j int) bool {
		return startSortKey(out[i]).After(startSortKey(out[j]))
	})
	return out, nil
}

// Create triggers an on-demand backup by creating a Backup CR targeting the
// cluster. labels are merged onto the object (cnpg.io/cluster is always set so
// it shows up in List).
func Create(ctx context.Context, dyn dynamic.Interface, namespace, cluster, name string, labels map[string]string) (Backup, error) {
	merged := map[string]any{clusterLabel: cluster}
	for k, v := range labels {
		merged[k] = v
	}
	obj := &unstructured.Unstructured{
		Object: map[string]any{
			"apiVersion": k8s.CNPGBackupGVR.Group + "/" + k8s.CNPGBackupGVR.Version,
			"kind":       "Backup",
			"metadata":   map[string]any{"name": name, "labels": merged},
			"spec": map[string]any{
				"cluster": map[string]any{"name": cluster},
				"method":  "barmanObjectStore",
			},
		},
	}
	created, err := dyn.Resource(k8s.CNPGBackupGVR).Namespace(namespace).Create(ctx, obj, metav1.CreateOptions{})
	if err != nil {
		return Backup{}, err
	}
	return convert(created), nil
}

func convert(u *unstructured.Unstructured) Backup {
	b := Backup{Name: u.GetName()}
	b.Method, _, _ = unstructured.NestedString(u.Object, "spec", "method")
	b.Phase, _, _ = unstructured.NestedString(u.Object, "status", "phase")
	b.BackupID, _, _ = unstructured.NestedString(u.Object, "status", "backupId")
	b.Error, _, _ = unstructured.NestedString(u.Object, "status", "error")
	b.StartedAt = parseTime(u.Object, "status", "startedAt")
	b.StoppedAt = parseTime(u.Object, "status", "stoppedAt")
	return b
}

func parseTime(o map[string]any, fields ...string) *time.Time {
	s, ok, _ := unstructured.NestedString(o, fields...)
	if !ok || s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil
	}
	return &t
}

// startSortKey orders by StartedAt, falling back to zero so un-started backups
// sort last.
func startSortKey(b Backup) time.Time {
	if b.StartedAt != nil {
		return *b.StartedAt
	}
	return time.Time{}
}
