-- +goose Up

-- +goose StatementBegin
ALTER TYPE source_domain ADD VALUE IF NOT EXISTS 'logs';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TYPE source_kind ADD VALUE IF NOT EXISTS 'loki';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TYPE source_kind ADD VALUE IF NOT EXISTS 'kube_logs';
-- +goose StatementEnd

-- +goose Down

-- Postgres ALTER TYPE ... DROP VALUE is unsupported. Down migration is
-- a no-op; rolling back this migration leaves the enum values in place.
-- New rows referencing them must be deleted before further migrations.
SELECT 1;
