package source

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
)

// LogLine is the internal representation of one log entry. Wire form
// (openapi.LogLine) is built at the handler edge.
type LogLine struct {
	Time      time.Time
	Level     openapi.LogLevel
	Message   string
	Pod       string
	Container string
}

// LogsCapable is implemented by sources that can serve the logs domain.
// Capabilities are static per source kind (no probe — operator's intent
// is the kind they chose, not what's queryable).
type LogsCapable interface {
	Source

	Supports() []openapi.LogCapability

	// Tail returns lines since `from`, sorted ascending. Callers use this
	// as the polling primitive: pass `from = lastSeenTs + 1ns` on each
	// poll. First call should pass `from = now - <some seconds>`.
	Tail(ctx context.Context, sel ResourceSelector, from time.Time, limit int) ([]LogLine, error)

	// Search returns lines matching the (optional) free-text query within
	// the operator-selected window. Sources that don't implement search
	// (kube-logs) return an apierr.BadRequest; handler guards against
	// invocation via Supports().
	Search(ctx context.Context, sel ResourceSelector, query string, r Range, limit int) ([]LogLine, error)

	// Probe is a cheap reachability check. Used by the capabilities
	// handler to surface "unreachable" vs "configured" in the UI.
	Probe(ctx context.Context) error
}

// errorPattern catches "error", "fatal", "panic" in any case anywhere
// in the line; conservative so plain "no errors" doesn't promote a line
// to error severity.
var (
	errorPattern = regexp.MustCompile(`(?i)\b(error|fatal|panic)\b`)
	warnPattern  = regexp.MustCompile(`(?i)\b(warn|warning)\b`)
	debugPattern = regexp.MustCompile(`(?i)\bdebug\b`)
	infoPattern  = regexp.MustCompile(`(?i)\binfo\b`)
)

// ParseLevel returns the best-effort log level for a raw line. Conservative
// — only promotes to error/warn/debug when a clear keyword is present;
// info when the keyword appears (typical structured loggers prefix lines
// with "INFO "), otherwise unknown.
func ParseLevel(line string) openapi.LogLevel {
	s := strings.TrimSpace(line)
	switch {
	case errorPattern.MatchString(s):
		return openapi.LogLevelError
	case warnPattern.MatchString(s):
		return openapi.LogLevelWarn
	case debugPattern.MatchString(s):
		return openapi.LogLevelDebug
	case infoPattern.MatchString(s):
		return openapi.LogLevelInfo
	}
	return openapi.LogLevelUnknown
}
