-- Extend existing private document storage; never rewrite saved plans or history.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE fitquest.training_plans
 DROP CONSTRAINT training_plans_schema_version_check,
 ADD CONSTRAINT training_plans_schema_version_check CHECK(schema_version IS NULL OR schema_version IN ('complete-week-v1','document-week-v1','document-week-v2')),
 DROP CONSTRAINT training_plans_check,
 ADD CONSTRAINT training_plans_document_version_check CHECK(document_plan IS NULL OR ((schema_version IS NOT DISTINCT FROM 'document-week-v1' OR schema_version IS NOT DISTINCT FROM 'document-week-v2') AND jsonb_typeof(document_plan)='object' AND octet_length(document_plan::text)<=512000));
-- A successful, explicitly requested revision publishes its display version atomically.
GRANT UPDATE(schema_version) ON fitquest.training_plans TO fitquest_app;
ALTER TABLE fitquest.plan_validation_diagnostics
 DROP CONSTRAINT plan_validation_diagnostics_schema_version_check,
 ADD CONSTRAINT plan_validation_diagnostics_schema_version_check CHECK(schema_version IN ('complete-week-v1','document-week-v1','document-week-v2'));
