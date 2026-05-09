package deployment

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

// StubRuntime is an in-memory dev/test runtime. Simulates an apply by
// transitioning pending → applying → applied over a couple of seconds.
type StubRuntime struct {
	// applyDelay is the simulated time spent in `applying`. Configurable for
	// tests; defaults to 2s.
	applyDelay time.Duration
}

func NewStubRuntime() *StubRuntime {
	return &StubRuntime{applyDelay: 2 * time.Second}
}

func (r *StubRuntime) Apply(
	ctx context.Context,
	deploymentID uuid.UUID,
	_ []byte,
	su StatusUpdater,
) {
	// Detach from request ctx — apply lives past the HTTP response. Bound to
	// the process lifetime; SIGTERM cancels via cmd/backend signal handler in
	// future. For now: best-effort, lost on restart.
	go func() {
		bg := context.Background()
		if err := su.MarkApplying(bg, deploymentID); err != nil {
			slog.Error("stub runtime: mark applying", "id", deploymentID, "error", err)
			return
		}
		time.Sleep(r.applyDelay)
		if err := su.MarkApplied(bg, deploymentID); err != nil {
			slog.Error("stub runtime: mark applied", "id", deploymentID, "error", err)
			return
		}
		slog.Info("stub runtime: deployment applied", "id", deploymentID)
	}()
}
