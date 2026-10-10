-- Additive document storage; existing catalog plans and accounting remain unchanged.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE fitquest.training_plans
 DROP CONSTRAINT training_plans_schema_version_check,
 ADD CONSTRAINT training_plans_schema_version_check CHECK(schema_version IS NULL OR schema_version IN ('complete-week-v1','document-week-v1')),
 ADD COLUMN document_plan jsonb CHECK(document_plan IS NULL OR (schema_version IS NOT DISTINCT FROM 'document-week-v1' AND jsonb_typeof(document_plan)='object' AND octet_length(document_plan::text)<=512000)),
 ADD COLUMN document_history jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(document_history)='array');
-- Accepted snapshots remain private and are deleted only with their owning plan.
GRANT UPDATE(document_plan,document_history) ON fitquest.training_plans TO fitquest_app;
ALTER TABLE fitquest.plan_validation_diagnostics
 DROP CONSTRAINT plan_validation_diagnostics_schema_version_check,
 ADD CONSTRAINT plan_validation_diagnostics_schema_version_check CHECK(schema_version IN ('complete-week-v1','document-week-v1'));
