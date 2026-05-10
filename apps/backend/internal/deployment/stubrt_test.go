package deployment

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

func TestStubRuntime_RecordsCalls(t *testing.T) {
	rt := NewStubRuntime()
	p := Project{ID: uuid.New(), Slug: "demo", Name: "Demo"}
	state := State{Resources: []Resource{{ID: uuid.New(), Name: "api", Kind: "app"}}}

	if err := rt.Apply(context.Background(), p, "production", state); err != nil {
		t.Fatalf("apply: %v", err)
	}
	if rt.CallCount() != 1 {
		t.Fatalf("want 1 call, got %d", rt.CallCount())
	}
	got := rt.Calls[0]
	if got.Env != "production" || got.Project.Slug != "demo" {
		t.Fatalf("unexpected call: %+v", got)
	}
	if len(got.State.Resources) != 1 {
		t.Fatalf("state not recorded")
	}
}

func TestStubRuntime_PropagatesError(t *testing.T) {
	rt := &StubRuntime{Err: errors.New("boom")}
	err := rt.Apply(context.Background(), Project{}, "production", State{})
	if err == nil || err.Error() != "boom" {
		t.Fatalf("want boom, got %v", err)
	}
}
