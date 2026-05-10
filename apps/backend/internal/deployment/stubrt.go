package deployment

import (
	"context"
	"sync"
)

// StubRuntime records Apply calls in-memory. Used by deployment-service
// tests to assert what the service handed off, without spinning up k8s.
type StubRuntime struct {
	mu    sync.Mutex
	Calls []StubCall
	// Err, when set, is returned from every Apply.
	Err error
}

type StubCall struct {
	Project Project
	Env     string
	State   State
}

func NewStubRuntime() *StubRuntime { return &StubRuntime{} }

func (r *StubRuntime) Apply(_ context.Context, p Project, env string, s State) error {
	r.mu.Lock()
	r.Calls = append(r.Calls, StubCall{Project: p, Env: env, State: s})
	err := r.Err
	r.mu.Unlock()
	return err
}

func (r *StubRuntime) CallCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.Calls)
}
