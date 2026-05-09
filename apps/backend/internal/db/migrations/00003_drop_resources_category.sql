-- +goose Up
-- The resource wire shape now carries a single discriminated `config` field.
-- `category` is redundant with `kind`, drop it.
--
-- The `tg_resources_touch` trigger from 00001 references OLD/NEW.category in
-- its WHEN clause, so it must be re-created without that column reference.

DROP TRIGGER IF EXISTS tg_resources_touch ON resources;

ALTER TABLE resources DROP COLUMN category;

CREATE TRIGGER tg_resources_touch
  BEFORE UPDATE ON resources
  FOR EACH ROW
  WHEN (
    OLD.name       IS DISTINCT FROM NEW.name OR
    OLD.kind       IS DISTINCT FROM NEW.kind OR
    OLD.spec       IS DISTINCT FROM NEW.spec OR
    OLD.project_id IS DISTINCT FROM NEW.project_id
  )
  EXECUTE FUNCTION touch_updated();

-- +goose Down
DROP TRIGGER IF EXISTS tg_resources_touch ON resources;
ALTER TABLE resources ADD COLUMN category TEXT NOT NULL DEFAULT '';
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
