-- +goose Up

CREATE TYPE source_kind   AS ENUM ('prometheus', 'metrics_server');
CREATE TYPE source_domain AS ENUM ('metrics');

CREATE TABLE sources (
  id              UUID         PRIMARY KEY,
  kind            source_kind  NOT NULL,
  name            TEXT         NOT NULL UNIQUE,
  config          JSONB        NOT NULL,
  auth_encrypted  BYTEA,
  created         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE source_defaults (
  domain     source_domain  PRIMARY KEY,
  source_id  UUID           NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  updated    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tg_sources_touch         BEFORE UPDATE ON sources         FOR EACH ROW EXECUTE FUNCTION touch_updated();
CREATE TRIGGER tg_source_defaults_touch BEFORE UPDATE ON source_defaults FOR EACH ROW EXECUTE FUNCTION touch_updated();

-- +goose Down

DROP TABLE IF EXISTS source_defaults;
DROP TABLE IF EXISTS sources;
DROP TYPE  IF EXISTS source_domain;
DROP TYPE  IF EXISTS source_kind;
