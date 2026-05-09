-- +goose Up
-- Switch `resource_variables.variable_id → variables(project_id, id)` from
-- DEFERRED NO ACTION to ON DELETE CASCADE.
--
-- Rationale: a resource_variables row is a graph edge from importer →
-- source. When the source variable is deleted (directly or via the resource
-- it belongs to being deleted), the edge no longer makes sense and should
-- vanish. The previous DEFERRED constraint forced commit-time errors that
-- surface as 500s and require users to manually unlink importers before
-- deleting a service.
--
-- Trade-off accepted: importer silently loses the env var on next deploy.
-- Audit/event logging (future) is the right place to surface this.

ALTER TABLE resource_variables
  DROP CONSTRAINT resource_variables_project_id_variable_id_fkey;

ALTER TABLE resource_variables
  ADD CONSTRAINT resource_variables_project_id_variable_id_fkey
    FOREIGN KEY (project_id, variable_id)
    REFERENCES variables(project_id, id)
    ON DELETE CASCADE;

-- +goose Down
ALTER TABLE resource_variables
  DROP CONSTRAINT resource_variables_project_id_variable_id_fkey;

ALTER TABLE resource_variables
  ADD CONSTRAINT resource_variables_project_id_variable_id_fkey
    FOREIGN KEY (project_id, variable_id)
    REFERENCES variables(project_id, id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
