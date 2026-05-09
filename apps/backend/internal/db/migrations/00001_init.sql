-- +goose Up

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE deployment_status AS ENUM ('pending', 'applying', 'applied', 'failed');
CREATE TYPE route_path_type   AS ENUM ('prefix', 'exact');
CREATE TYPE variable_scope    AS ENUM ('shared', 'resource');

CREATE TABLE projects (
  id           UUID         PRIMARY KEY,
  slug         CITEXT       NOT NULL UNIQUE,
  name         TEXT         NOT NULL,
  description  TEXT,
  created      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE resources (
  id          UUID             PRIMARY KEY,
  project_id  UUID             NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT             NOT NULL,
  category    TEXT             NOT NULL,
  kind        TEXT             NOT NULL,
  position_x  DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y  DOUBLE PRECISION NOT NULL DEFAULT 0,
  spec        JSONB            NOT NULL,
  created     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name),
  UNIQUE (project_id, id)
);

CREATE TABLE variables (
  id              UUID            PRIMARY KEY,
  project_id      UUID            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  resource_id     UUID,
  scope           variable_scope  GENERATED ALWAYS AS (
                    CASE WHEN resource_id IS NULL
                         THEN 'shared'::variable_scope
                         ELSE 'resource'::variable_scope
                    END
                  ) STORED,
  key             TEXT            NOT NULL,
  value           TEXT,
  value_encrypted BYTEA,
  secret          BOOLEAN         GENERATED ALWAYS AS (value_encrypted IS NOT NULL) STORED,
  created         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT secret_value_xor CHECK (
    (value IS NOT NULL AND value_encrypted IS NULL) OR
    (value IS NULL     AND value_encrypted IS NOT NULL)
  ),

  CONSTRAINT variables_resource_in_project
    FOREIGN KEY (project_id, resource_id)
    REFERENCES resources(project_id, id)
    ON DELETE CASCADE,

  UNIQUE (project_id, id)
);

CREATE INDEX idx_variables_project  ON variables(project_id);
CREATE INDEX idx_variables_resource ON variables(resource_id) WHERE resource_id IS NOT NULL;

CREATE UNIQUE INDEX idx_variables_shared_key
  ON variables(project_id, key) WHERE resource_id IS NULL;
CREATE UNIQUE INDEX idx_variables_resource_key
  ON variables(project_id, resource_id, key) WHERE resource_id IS NOT NULL;

CREATE TABLE resource_variables (
  project_id   UUID         NOT NULL,
  resource_id  UUID         NOT NULL,
  variable_id  UUID         NOT NULL,
  key          TEXT         NOT NULL,
  created      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (resource_id, key),

  FOREIGN KEY (project_id, resource_id)
    REFERENCES resources(project_id, id)
    ON DELETE CASCADE,

  FOREIGN KEY (project_id, variable_id)
    REFERENCES variables(project_id, id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_resource_variables_variable         ON resource_variables(variable_id);
CREATE INDEX idx_resource_variables_project_resource ON resource_variables(project_id, resource_id);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION check_resource_variable_no_owned_collision()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM variables
     WHERE resource_id = NEW.resource_id
       AND key = NEW.key
  ) THEN
    RAISE EXCEPTION
      'resource_variables.key % collides with owned variable on resource %',
      NEW.key, NEW.resource_id;
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER tg_resource_variables_no_owned_collision
  BEFORE INSERT OR UPDATE ON resource_variables
  FOR EACH ROW
  EXECUTE FUNCTION check_resource_variable_no_owned_collision();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION check_owned_variable_no_import_collision()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.resource_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM resource_variables
     WHERE resource_id = NEW.resource_id
       AND key = NEW.key
  ) THEN
    RAISE EXCEPTION
      'variable key % collides with imported variable on resource %',
      NEW.key, NEW.resource_id;
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER tg_variables_no_import_collision
  BEFORE INSERT OR UPDATE ON variables
  FOR EACH ROW
  EXECUTE FUNCTION check_owned_variable_no_import_collision();

CREATE TABLE routes (
  id           UUID            PRIMARY KEY,
  project_id   UUID            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  resource_id  UUID            NOT NULL,
  domain       CITEXT          NOT NULL,
  path         TEXT            NOT NULL DEFAULT '/',
  path_type    route_path_type NOT NULL DEFAULT 'prefix',
  port         INT             NOT NULL CHECK (port BETWEEN 1 AND 65535),
  tls          BOOLEAN         NOT NULL DEFAULT TRUE,
  config       JSONB           NOT NULL DEFAULT '{}'::jsonb,
  created      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  FOREIGN KEY (project_id, resource_id)
    REFERENCES resources(project_id, id)
    ON DELETE CASCADE,

  UNIQUE (domain, path, path_type)
);

CREATE INDEX idx_routes_resource ON routes(resource_id);
CREATE INDEX idx_routes_project  ON routes(project_id);

CREATE TABLE registries (
  id                  UUID         PRIMARY KEY,
  name                TEXT         NOT NULL UNIQUE,
  url                 TEXT         NOT NULL,
  username            TEXT         NOT NULL,
  password_encrypted  BYTEA        NOT NULL,
  created             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE deployments (
  id              UUID               PRIMARY KEY,
  project_id      UUID               NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  seq             INT                NOT NULL,
  status          deployment_status  NOT NULL,
  status_message  TEXT,
  payload         JSONB              NOT NULL,
  checksum        TEXT               NOT NULL,
  created         TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  applied         TIMESTAMPTZ,

  UNIQUE (project_id, seq)
);

CREATE INDEX idx_deployments_project_seq ON deployments(project_id, seq DESC);

CREATE UNIQUE INDEX idx_deployments_one_active_per_project
  ON deployments(project_id) WHERE status IN ('pending', 'applying');

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION next_deployment_seq()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.seq IS NULL THEN
    PERFORM pg_advisory_xact_lock(
      ('x' || substr(md5('vyft.deployment_seq:' || NEW.project_id::text), 1, 16))::bit(64)::bigint
    );
    SELECT COALESCE(MAX(seq), 0) + 1
      INTO NEW.seq
      FROM deployments
     WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER tg_deployments_seq
  BEFORE INSERT ON deployments
  FOR EACH ROW
  EXECUTE FUNCTION next_deployment_seq();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION deployments_terminal_immutable()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('applied', 'failed') THEN
    IF NEW.payload    IS DISTINCT FROM OLD.payload
       OR NEW.checksum   IS DISTINCT FROM OLD.checksum
       OR NEW.seq        IS DISTINCT FROM OLD.seq
       OR NEW.status     IS DISTINCT FROM OLD.status
       OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION
        'deployment % is in terminal state %; payload/checksum/seq/status are immutable',
        OLD.id, OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER tg_deployments_terminal_immutable
  BEFORE UPDATE ON deployments
  FOR EACH ROW
  EXECUTE FUNCTION deployments_terminal_immutable();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION touch_updated()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated = NOW();
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER tg_projects_touch    BEFORE UPDATE ON projects    FOR EACH ROW EXECUTE FUNCTION touch_updated();

CREATE TRIGGER tg_resources_touch
  BEFORE UPDATE ON resources
  FOR EACH ROW
  WHEN (
    OLD.name       IS DISTINCT FROM NEW.name       OR
    OLD.category   IS DISTINCT FROM NEW.category   OR
    OLD.kind       IS DISTINCT FROM NEW.kind       OR
    OLD.spec       IS DISTINCT FROM NEW.spec       OR
    OLD.project_id IS DISTINCT FROM NEW.project_id
  )
  EXECUTE FUNCTION touch_updated();

CREATE TRIGGER tg_variables_touch   BEFORE UPDATE ON variables   FOR EACH ROW EXECUTE FUNCTION touch_updated();
CREATE TRIGGER tg_routes_touch      BEFORE UPDATE ON routes      FOR EACH ROW EXECUTE FUNCTION touch_updated();
CREATE TRIGGER tg_registries_touch  BEFORE UPDATE ON registries  FOR EACH ROW EXECUTE FUNCTION touch_updated();

-- +goose Down

DROP TABLE IF EXISTS deployments         CASCADE;
DROP TABLE IF EXISTS registries          CASCADE;
DROP TABLE IF EXISTS routes              CASCADE;
DROP TABLE IF EXISTS resource_variables  CASCADE;
DROP TABLE IF EXISTS variables           CASCADE;
DROP TABLE IF EXISTS resources           CASCADE;
DROP TABLE IF EXISTS projects            CASCADE;

DROP FUNCTION IF EXISTS deployments_terminal_immutable();
DROP FUNCTION IF EXISTS next_deployment_seq();
DROP FUNCTION IF EXISTS check_owned_variable_no_import_collision();
DROP FUNCTION IF EXISTS check_resource_variable_no_owned_collision();
DROP FUNCTION IF EXISTS touch_updated();

DROP TYPE IF EXISTS variable_scope;
DROP TYPE IF EXISTS route_path_type;
DROP TYPE IF EXISTS deployment_status;
