-- +goose Up

CREATE TYPE source_kind   AS ENUM ('prometheus', 'metrics_server');
CREATE TYPE source_domain AS ENUM ('metrics');

CREATE TABLE sources (
  id              UUID          PRIMARY KEY,
  kind            source_kind   NOT NULL,
  domain          source_domain NOT NULL,
  name            TEXT          NOT NULL UNIQUE,
  is_default      BOOLEAN       NOT NULL DEFAULT false,
  config          JSONB         NOT NULL,
  auth_encrypted  BYTEA,
  created         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- At most one default source per domain. Partial index instead of a
-- generated key so deletions automatically leave the domain with no
-- default until the operator picks the next one.
CREATE UNIQUE INDEX idx_sources_one_default_per_domain
  ON sources(domain) WHERE is_default = true;

CREATE TRIGGER tg_sources_touch BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION touch_updated();

-- +goose Down

DROP TABLE IF EXISTS sources;
DROP TYPE  IF EXISTS source_domain;
DROP TYPE  IF EXISTS source_kind;
