-- +goose Up

ALTER TABLE resources ADD COLUMN slug TEXT;
UPDATE resources SET slug = name WHERE slug IS NULL;
ALTER TABLE resources ALTER COLUMN slug SET NOT NULL;
ALTER TABLE resources ADD CONSTRAINT resources_project_id_slug_key UNIQUE (project_id, slug);
