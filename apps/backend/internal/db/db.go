// Package db wraps a pgxpool.Pool with the sqlc-generated Queries.
//
// Services hold a *DB; for atomic multi-row operations they call DB.WithTx
// and use the *sqlc.Queries handed to the callback. The pool-scoped Q on
// the wrapper must NOT be used inside a WithTx body — that silently bypasses
// the transaction.
package db

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
)

type DB struct {
	Pool *pgxpool.Pool
	Q    *sqlc.Queries
}

func New(pool *pgxpool.Pool) *DB {
	return &DB{Pool: pool, Q: sqlc.New(pool)}
}

// WithTx runs fn inside a database transaction, passing it a *sqlc.Queries
// scoped to the transaction. Commits on a nil return, rolls back on error
// or panic.
//
// Use for any operation that modifies more than one row across tables and
// must be atomic (resource.Create persisting embedded routes + variables,
// imported variable rename = drop+recreate, etc.).
func (d *DB) WithTx(ctx context.Context, fn func(*sqlc.Queries) error) (err error) {
	tx, err := d.Pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		}
		if err != nil {
			_ = tx.Rollback(ctx)
			return
		}
		err = tx.Commit(ctx)
	}()
	return fn(sqlc.New(tx))
}
