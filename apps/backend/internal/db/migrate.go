package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/jackc/pgx/v5/stdlib"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"
)

// Migrate runs all pending up migrations against pool using the embedded
// migrations FS. Safe to call on every process boot.
//
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	goose.SetBaseFS(MigrationsFS)
	goose.SetLogger(goose.NopLogger())

	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("goose set dialect: %w", err)
	}

	sqlDB := stdlib.OpenDBFromPool(pool)
	defer sqlDB.Close()

	if err := goose.UpContext(ctx, sqlDB, "migrations"); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}

// MigrateDB is the same as Migrate but accepts a *sql.DB directly — useful
// for CLI tools that don't already have a pgxpool.
func MigrateDB(ctx context.Context, sqlDB *sql.DB) error {
	goose.SetBaseFS(MigrationsFS)
	goose.SetLogger(goose.NopLogger())

	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("goose set dialect: %w", err)
	}
	if err := goose.UpContext(ctx, sqlDB, "migrations"); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}
