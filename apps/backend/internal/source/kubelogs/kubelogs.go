// Package kubelogs implements source.LogsCapable against the
// kubernetes pods/log endpoint. No URL or auth — uses the backend's
// in-process kube clientset. Mirrors the metricsserver "always-on
// baseline" pattern for the logs domain.
package kubelogs

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/platform/apierr"
	"github.com/vyftlabs/vyft/apps/backend/internal/source"
)

const Kind = "kube_logs"

type KubeLogs struct {
	id   uuid.UUID
	name string
	cs   kubernetes.Interface
}

func New(id uuid.UUID, name string, cs kubernetes.Interface) *KubeLogs {
	return &KubeLogs{id: id, name: name, cs: cs}
}

func (k *KubeLogs) ID() uuid.UUID { return k.id }
func (k *KubeLogs) Kind() string  { return Kind }

func (k *KubeLogs) Supports() []openapi.LogCapability {
	return []openapi.LogCapability{openapi.Tail, openapi.Level}
}

// Probe is satisfied by a successful pod list — the same call we'd
// otherwise make to enumerate pods for log fetching. Cheap.
func (k *KubeLogs) Probe(ctx context.Context) error {
	if k.cs == nil {
		return fmt.Errorf("kube clientset unavailable on backend")
	}
	_, err := k.cs.Discovery().ServerVersion()
	if err != nil {
		return fmt.Errorf("kube discovery: %w", err)
	}
	return nil
}

func (k *KubeLogs) Tail(ctx context.Context, sel source.ResourceSelector, from time.Time, limit int) ([]source.LogLine, error) {
	if k.cs == nil {
		return nil, apierr.ServiceUnavailable("kube clientset unavailable on backend")
	}
	if from.IsZero() {
		from = time.Now().Add(-30 * time.Second)
	}
	pods, err := k.cs.CoreV1().Pods(sel.Namespace).List(ctx, metav1.ListOptions{
		LabelSelector: sel.PodLabelSelector(),
	})
	if err != nil {
		return nil, fmt.Errorf("kubelogs list pods: %w", err)
	}
	var out []source.LogLine
	since := metav1.NewTime(from)
	tail := int64(limit)
	for _, p := range pods.Items {
		// Multi-container pods: fetch each container's stream and tag the
		// container name on the line. For single-container pods this
		// loops once.
		for _, c := range p.Spec.Containers {
			lines, err := k.fetchContainer(ctx, p, c.Name, &corev1.PodLogOptions{
				SinceTime:  &since,
				TailLines:  &tail,
				Timestamps: true,
				Container:  c.Name,
			})
			if err != nil {
				// Skip individual container errors so one bad pod doesn't
				// kill the whole tail; surface in caller logs if needed.
				continue
			}
			out = append(out, lines...)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Time.Before(out[j].Time) })
	if len(out) > limit {
		out = out[len(out)-limit:]
	}
	return out, nil
}

// Search rejects the call — kube API doesn't index. Handler should guard
// via Supports() before reaching here; defensive.
func (k *KubeLogs) Search(_ context.Context, _ source.ResourceSelector, _ string, _ source.Range, _ int) ([]source.LogLine, error) {
	return nil, apierr.BadRequest("kube-logs source doesn't support search")
}

// fetchContainer pulls one container's log stream and returns one
// LogLine per stream line. Each line is prefixed by the RFC3339Nano
// timestamp because Timestamps=true was set; we split it off.
func (k *KubeLogs) fetchContainer(ctx context.Context, pod corev1.Pod, container string, opts *corev1.PodLogOptions) ([]source.LogLine, error) {
	req := k.cs.CoreV1().Pods(pod.Namespace).GetLogs(pod.Name, opts)
	stream, err := req.Stream(ctx)
	if err != nil {
		return nil, err
	}
	defer stream.Close()

	var out []source.LogLine
	scanner := bufio.NewScanner(stream)
	// Some log lines can be long; raise the buffer ceiling.
	scanner.Buffer(make([]byte, 4096), 1024*1024)
	for scanner.Scan() {
		raw := scanner.Text()
		ts, msg := splitKubeLogLine(raw)
		out = append(out, source.LogLine{
			Time:      ts,
			Level:     source.ParseLevel(msg),
			Message:   msg,
			Pod:       pod.Name,
			Container: container,
		})
	}
	return out, scanner.Err()
}

// splitKubeLogLine peels off the RFC3339Nano timestamp prefix that the
// kube API prepends when Timestamps=true. Falls back to now + the raw
// line on malformed input.
func splitKubeLogLine(raw string) (time.Time, string) {
	if i := strings.IndexByte(raw, ' '); i > 0 {
		if t, err := time.Parse(time.RFC3339Nano, raw[:i]); err == nil {
			return t, raw[i+1:]
		}
	}
	return time.Now().UTC(), raw
}

// Compile-time check.
var _ io.Closer = (io.Closer)(nil)
