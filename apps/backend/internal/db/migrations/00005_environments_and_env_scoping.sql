-- +goose Up
-- Introduce first-class environments. Drop+recreate per-env tables.
-- Pre-launch: no data preservation.
--
-- Tables touched:
--   * environments (new)
--   * deployments  (rewrite: drop seq/payload/checksum, add environment_id)
--   * variables          (recreate with environment_id)
--   * resource_variables (recreate with environment_id)
--   * routes             (recreate with environment_id)

DROP TRIGGER IF EXISTS tg_deployments_seq               ON deployments;
DROP TRIGGER IF EXISTS tg_deployments_terminal_immutable ON deployments;
DROP TRIGGER IF EXISTS tg_routes_touch                   ON routes;
DROP TRIGGER IF EXISTS tg_variables_touch                ON variables;
DROP TRIGGER IF EXISTS tg_variables_no_import_collision  ON variables;
DROP TRIGGER IF EXISTS tg_resource_variables_no_owned_collision ON resource_variables;

DROP FUNCTION IF EXISTS next_deployment_seq();
DROP FUNCTION IF EXISTS deployments_terminal_immutable();

DROP TABLE IF EXISTS deployments         CASCADE;
DROP TABLE IF EXISTS routes              CASCADE;
DROP TABLE IF EXISTS resource_variables  CASCADE;
DROP TABLE IF EXISTS variables           CASCADE;

CREATE TABLE environments (
  id          UUID         PRIMARY KEY,
  project_id  UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug        TEXT         NOT NULL,
  created     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, slug),
  UNIQUE (project_id, id)
);
CREATE INDEX idx_environments_project ON environments(project_id);

CREATE TABLE variables (
  id              UUID            PRIMARY KEY,
  project_id      UUID            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id  UUID            NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
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

  CONSTRAINT variables_env_in_project
    FOREIGN KEY (project_id, environment_id)
    REFERENCES environments(project_id, id)
    ON DELETE CASCADE,

  UNIQUE (project_id, id)
);

CREATE INDEX idx_variables_project     ON variables(project_id);
CREATE INDEX idx_variables_env         ON variables(environment_id);
CREATE INDEX idx_variables_resource    ON variables(resource_id) WHERE resource_id IS NOT NULL;

CREATE UNIQUE INDEX idx_variables_shared_key
  ON variables(project_id, environment_id, key) WHERE resource_id IS NULL;
CREATE UNIQUE INDEX idx_variables_resource_key
  ON variables(project_id, environment_id, resource_id, key) WHERE resource_id IS NOT NULL;

CREATE TABLE resource_variables (
  project_id      UUID         NOT NULL,
  environment_id  UUID         NOT NULL,
  resource_id     UUID         NOT NULL,
  variable_id     UUID         NOT NULL,
  key             TEXT         NOT NULL,
  created         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (resource_id, environment_id, key),

  FOREIGN KEY (project_id, resource_id)
    REFERENCES resources(project_id, id)
    ON DELETE CASCADE,

  FOREIGN KEY (project_id, environment_id)
    REFERENCES environments(project_id, id)
    ON DELETE CASCADE,

  FOREIGN KEY (project_id, variable_id)
    REFERENCES variables(project_id, id)
    ON DELETE CASCADE
);

CREATE INDEX idx_resource_variables_variable         ON resource_variables(variable_id);
CREATE INDEX idx_resource_variables_project_resource ON resource_variables(project_id, resource_id);
CREATE INDEX idx_resource_variables_env              ON resource_variables(environment_id);

-- Cross-table key collision triggers (now scoped by environment).

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION check_resource_variable_no_owned_collision()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM variables
     WHERE resource_id    = NEW.resource_id
       AND environment_id = NEW.environment_id
       AND key            = NEW.key
  ) THEN
    RAISE EXCEPTION
      'resource_variables.key % collides with owned variable on resource % env %',
      NEW.key, NEW.resource_id, NEW.environment_id;
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
  SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.resource_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM resource_variables
     WHERE resource_id    = NEW.resource_id
       AND environment_id = NEW.environment_id
       AND key            = NEW.key
  ) THEN
    RAISE EXCEPTION
      'variable key % collides with imported variable on resource % env %',
      NEW.key, NEW.resource_id, NEW.environment_id;
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER tg_variables_no_import_collision
  BEFORE INSERT OR UPDATE ON variables
  FOR EACH ROW
  EXECUTE FUNCTION check_owned_variable_no_import_collision();

CREATE TRIGGER tg_variables_touch
  BEFORE UPDATE ON variables
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated();

CREATE TABLE routes (
  id              UUID            PRIMARY KEY,
  project_id      UUID            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id  UUID            NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  resource_id     UUID            NOT NULL,
  domain          CITEXT          NOT NULL,
  path            TEXT            NOT NULL DEFAULT '/',
  path_type       route_path_type NOT NULL DEFAULT 'prefix',
  port            INT             NOT NULL CHECK (port BETWEEN 1 AND 65535),
  tls             BOOLEAN         NOT NULL DEFAULT TRUE,
  config          JSONB           NOT NULL DEFAULT '{}'::jsonb,
  created         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  FOREIGN KEY (project_id, resource_id)
    REFERENCES resources(project_id, id)
    ON DELETE CASCADE,

  FOREIGN KEY (project_id, environment_id)
    REFERENCES environments(project_id, id)
    ON DELETE CASCADE,

  UNIQUE (environment_id, domain, path)
);

CREATE INDEX idx_routes_resource ON routes(resource_id);
CREATE INDEX idx_routes_project  ON routes(project_id);
CREATE INDEX idx_routes_env      ON routes(environment_id);

CREATE TRIGGER tg_routes_touch
  BEFORE UPDATE ON routes
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated();

CREATE TABLE deployments (
  id              UUID               PRIMARY KEY,
  project_id      UUID               NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id  UUID               NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  status          deployment_status  NOT NULL,
  error           TEXT,
  created         TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  applied         TIMESTAMPTZ,

  FOREIGN KEY (project_id, environment_id)
    REFERENCES environments(project_id, id)
    ON DELETE CASCADE
);

CREATE INDEX idx_deployments_project_env_created
  ON deployments(project_id, environment_id, created DESC);

CREATE UNIQUE INDEX one_active_deployment_per_project_env
  ON deployments(project_id, environment_id)
  WHERE status IN ('pending', 'applying');

-- +goose Down
DROP TABLE IF EXISTS deployments         CASCADE;
DROP TABLE IF EXISTS routes              CASCADE;
DROP TABLE IF EXISTS resource_variables  CASCADE;
DROP TABLE IF EXISTS variables           CASCADE;
DROP TABLE IF EXISTS environments        CASCADE;
