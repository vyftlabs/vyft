// Package web embeds the frontend build artifact and serves it.
//
// Build sequence: `apps/web` produces `dist/`; that dist must be copied to
// `apps/backend/internal/web/dist/` before `go build`. A `.gitkeep` is
// checked in so fresh clones build even before the frontend is built.
package web

import "embed"

//go:embed dist
var Dist embed.FS
