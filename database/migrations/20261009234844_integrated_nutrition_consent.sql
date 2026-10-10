SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE fitquest.profiles ADD COLUMN planning_consent jsonb;
ALTER TABLE fitquest.profiles ADD CONSTRAINT profiles_planning_consent_check CHECK(planning_consent IS NULL OR (jsonb_typeof(planning_consent)='object' AND octet_length(planning_consent::text)<=1000));
GRANT UPDATE(planning_consent) ON fitquest.profiles TO fitquest_app;
ALTER TABLE fitquest.training_plans
 DROP CONSTRAINT training_plans_schema_version_check,
 ADD CONSTRAINT training_plans_schema_version_check CHECK(schema_version IS NULL OR schema_version IN ('complete-week-v1','document-week-v1','document-week-v2','document-week-v3')),
 DROP CONSTRAINT training_plans_document_version_check,
 ADD CONSTRAINT training_plans_document_version_check CHECK(document_plan IS NULL OR (schema_version IS NOT NULL AND schema_version IN ('document-week-v1','document-week-v2','document-week-v3') AND jsonb_typeof(document_plan)='object' AND octet_length(document_plan::text)<=512000));
ALTER TABLE fitquest.plan_validation_diagnostics
 DROP CONSTRAINT plan_validation_diagnostics_schema_version_check,
 ADD CONSTRAINT plan_validation_diagnostics_schema_version_check CHECK(schema_version IN ('complete-week-v1','document-week-v1','document-week-v2','document-week-v3'));
-- No backfill or automatic consent; legacy documents/history remain byte-for-byte intact.
