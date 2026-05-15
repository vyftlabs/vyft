-- +goose Up

ALTER TABLE sources
  ADD COLUMN editable BOOLEAN NOT NULL DEFAULT false;

-- +goose Down

ALTER TABLE sources DROP COLUMN IF EXISTS editable;
