// Package pgxid converts between domain UUIDs/timestamps and pgtype.
package pgxid

import (
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// PgUUID wraps a uuid.UUID into a pgtype.UUID (Valid set).
func PgUUID(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}

// UUIDStr renders a pgtype.UUID as the canonical string. "" when not Valid.
func UUIDStr(id pgtype.UUID) string {
	if !id.Valid {
		return ""
	}
	return uuid.UUID(id.Bytes).String()
}

// TsStr renders a pgtype.Timestamptz as RFC3339Nano UTC. "" when not Valid.
func TsStr(t pgtype.Timestamptz) string {
	if !t.Valid {
		return ""
	}
	return t.Time.UTC().Format(time.RFC3339Nano)
}
