-- +goose Up

ALTER TABLE sources
  ADD COLUMN provisioned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_sources_provisioned ON sources(provisioned) WHERE provisioned = true;

-- +goose Down

DROP INDEX IF EXISTS idx_sources_provisioned;
ALTER TABLE sources DROP COLUMN IF EXISTS provisioned;
