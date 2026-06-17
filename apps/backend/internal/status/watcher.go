package status

import (
	"context"
	"log/slog"
	"sync"

	appslisters "k8s.io/client-go/listers/apps/v1"
	corelisters "k8s.io/client-go/listers/core/v1"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"

	"github.com/vyftlabs/vyft/apps/backend/internal/runtime/k8s"
)

// Watcher maintains an in-memory, watch-backed view of every vyft-managed
// Deployment and Pod, and lets SSE handlers subscribe to per-project change
// notifications. One set of cluster watches serves all connections — cost
// scales with the cluster, not with the number of open browsers.
//
// The informer cache is scoped to objects carrying the project label, so it
// never holds non-vyft workloads.
type Watcher struct {
	factory   informers.SharedInformerFactory
	depLister appslisters.DeploymentLister
	podLister corelisters.PodLister
	synced    []cache.InformerSynced

	mu   sync.Mutex
	next int
	// subs maps project slug → subscriber id → signal channel. Each channel
	// is buffered(1) and written non-blocking, so a slow consumer coalesces
	// bursts (a rollout fires many pod events) into a single pending wakeup.
	subs map[string]map[int]chan struct{}
}

// NewWatcher builds the watcher and registers informer event handlers. Call
// Start to begin watching. Returns nil if cs is nil (no cluster configured).
func NewWatcher(cs kubernetes.Interface) *Watcher {
	if cs == nil {
		return nil
	}
	factory := informers.NewSharedInformerFactoryWithOptions(cs, 0,
		informers.WithTweakListOptions(func(o *metav1.ListOptions) {
			// Only vyft-owned objects carry this label; scopes the cache.
			o.LabelSelector = k8s.LabelProject
		}))

	depInf := factory.Apps().V1().Deployments()
	podInf := factory.Core().V1().Pods()

	w := &Watcher{
		factory:   factory,
		depLister: depInf.Lister(),
		podLister: podInf.Lister(),
		subs:      map[string]map[int]chan struct{}{},
	}

	h := cache.ResourceEventHandlerFuncs{
		AddFunc:    func(o any) { w.notify(o) },
		UpdateFunc: func(_, o any) { w.notify(o) },
		DeleteFunc: func(o any) { w.notify(o) },
	}
	// AddEventHandler can error only before Start; ignore for brevity.
	_, _ = depInf.Informer().AddEventHandler(h)
	_, _ = podInf.Informer().AddEventHandler(h)
	w.synced = []cache.InformerSynced{
		depInf.Informer().HasSynced,
		podInf.Informer().HasSynced,
	}
	return w
}

// Start begins the informers and blocks (in a goroutine) until the cache
// syncs. Watches stop when ctx is cancelled.
func (w *Watcher) Start(ctx context.Context) {
	if w == nil {
		return
	}
	w.factory.Start(ctx.Done())
	go func() {
		if !cache.WaitForCacheSync(ctx.Done(), w.synced...) {
			slog.Warn("status watcher: cache sync failed")
			return
		}
		slog.Info("status watcher: cache synced")
	}()
}

// Statuses returns the current health of every resource in a project, read
// from the informer cache (no API call). Nil watcher or lister error yields
// nil.
func (w *Watcher) Statuses(projectSlug string) map[string]Status {
	if w == nil {
		return nil
	}
	sel := labels.SelectorFromSet(labels.Set{k8s.LabelProject: projectSlug})
	deps, err := w.depLister.List(sel)
	if err != nil {
		return nil
	}
	pods, err := w.podLister.List(sel)
	if err != nil {
		return nil
	}
	return statusesFrom(deps, pods)
}

// Subscribe registers interest in a project's changes. The returned channel
// receives a (coalesced) signal on every relevant cluster event; the returned
// func unregisters it and must be called when the subscriber goes away.
func (w *Watcher) Subscribe(projectSlug string) (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)
	w.mu.Lock()
	id := w.next
	w.next++
	if w.subs[projectSlug] == nil {
		w.subs[projectSlug] = map[int]chan struct{}{}
	}
	w.subs[projectSlug][id] = ch
	w.mu.Unlock()

	return ch, func() {
		w.mu.Lock()
		delete(w.subs[projectSlug], id)
		if len(w.subs[projectSlug]) == 0 {
			delete(w.subs, projectSlug)
		}
		w.mu.Unlock()
	}
}

// notify wakes every subscriber for the project that owns the changed object.
func (w *Watcher) notify(obj any) {
	slug := projectSlugOf(obj)
	if slug == "" {
		return
	}
	w.mu.Lock()
	for _, ch := range w.subs[slug] {
		select {
		case ch <- struct{}{}:
		default: // already pending — coalesce
		}
	}
	w.mu.Unlock()
}

// projectSlugOf reads the project label off a changed object, unwrapping the
// tombstone the informer delivers for some deletes.
func projectSlugOf(obj any) string {
	if tomb, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		obj = tomb.Obj
	}
	switch o := obj.(type) {
	case *appsv1.Deployment:
		return o.Labels[k8s.LabelProject]
	case *corev1.Pod:
		return o.Labels[k8s.LabelProject]
	}
	return ""
}
