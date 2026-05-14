// Package web embeds the frontend build artifact and serves it.
//
// Build sequence: `apps/web` produces `dist/`; that dist must be copied to
// `apps/backend/internal/web/dist/` before `go build`. A `.gitkeep` is
// checked in so fresh clones build even before the frontend is built.
// `all:dist` is required so the dotfile counts as embeddable — the plain
// `dist` pattern excludes names starting with `.`.
package web

import "embed"

//go:embed all:dist
var Dist embed.FS
