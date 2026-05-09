package deployment

import (
	"context"

	"github.com/google/uuid"
)

// Runtime is the swap point for deployment apply backends. Stub for dev,
// real impl (k8s/nomad/...) lands later.
type Runtime interface {
	// Apply triggers an asynchronous apply of the deployment. The implementation
	// is responsible for transitioning the deployment's status (applying →
	// applied | failed) via the provided StatusUpdater. Apply itself returns
	// immediately after enqueueing the work.
	Apply(ctx context.Context, deploymentID uuid.UUID, payload []byte, su StatusUpdater)
}

// StatusUpdater lets a Runtime persist status transitions without coupling
// the runtime to the db package directly.
type StatusUpdater interface {
	MarkApplying(ctx context.Context, deploymentID uuid.UUID) error
	MarkApplied(ctx context.Context, deploymentID uuid.UUID) error
	MarkFailed(ctx context.Context, deploymentID uuid.UUID, reason string) error
}
