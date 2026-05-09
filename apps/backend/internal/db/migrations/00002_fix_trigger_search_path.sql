-- +goose Up
--
-- The trigger functions in 00001 set `search_path = pg_catalog, pg_temp` for
-- safety, but their bodies reference unqualified `variables` and
-- `resource_variables` — those are in `public`, which is no longer in the
-- function's path, so the triggers fail at runtime with
-- "relation X does not exist".
--
-- Adding `public` to the search_path keeps the safety against attacker
-- schemas while letting the functions resolve their own tables.

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION check_resource_variable_no_owned_collision()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog, pg_temp
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

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION check_owned_variable_no_import_collision()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog, pg_temp
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

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION next_deployment_seq()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog, pg_temp
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

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION deployments_terminal_immutable()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog, pg_temp
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

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION touch_updated()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated = NOW();
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

-- +goose Down
-- Restore the (broken) original search paths. Down here exists only for
-- symmetry; rolling back will reintroduce the trigger failure.
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
