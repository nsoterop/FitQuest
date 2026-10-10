-- Additive: legacy rows remain unversioned and unchanged. No data or accounting reset.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE fitquest.training_plans
  ADD COLUMN schema_version text CHECK(schema_version IS NULL OR schema_version='complete-week-v1'),
  ADD COLUMN complete_plan jsonb CHECK(complete_plan IS NULL OR (jsonb_typeof(complete_plan)='object' AND octet_length(complete_plan::text)<=512000)),
  ADD COLUMN accepted_at timestamptz,
  ADD CONSTRAINT complete_plan_version CHECK(complete_plan IS NULL OR schema_version IS NOT DISTINCT FROM 'complete-week-v1');
GRANT UPDATE(complete_plan,accepted_at) ON fitquest.training_plans TO fitquest_app;
