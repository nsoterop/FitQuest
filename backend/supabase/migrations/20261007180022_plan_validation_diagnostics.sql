-- Private, bounded operational diagnostics. No existing data or accounting changes.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE fitquest.plan_validation_diagnostics (
 user_id uuid NOT NULL, attempt_id uuid NOT NULL, plan_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '14 days',
 deployment_sha text CHECK(deployment_sha IS NULL OR deployment_sha ~ '^[0-9a-f]{40}$'),
 catalog_version text NOT NULL CHECK(length(catalog_version)<=80 AND catalog_version ~ '^[a-zA-Z0-9._-]+$'),
 schema_version text NOT NULL CHECK(schema_version='complete-week-v1'),
 diagnostic jsonb NOT NULL CHECK (
  jsonb_typeof(diagnostic)='object' AND octet_length(diagnostic::text)<=1024
  AND diagnostic ?& ARRAY['version','stage','rule']
  AND diagnostic - ARRAY['version','stage','rule','day','session','block','exercise','recovery','activityId','actualKind','allowedKinds']='{}'::jsonb
  AND diagnostic->'version'='1'::jsonb
  AND jsonb_typeof(diagnostic->'stage')='string' AND jsonb_typeof(diagnostic->'rule')='string'
  AND (diagnostic->>'stage')||':'||(diagnostic->>'rule') IN
   ('schema:shape','conversion:pair','conversion:unit','conversion:recovery','conversion:decode',
    'structure:overview','structure:block','structure:exercise','structure:recovery','structure:empty_plan',
    'catalog:lookup','catalog:tracking','catalog:equipment','catalog:load','integrity:kept_work','integrity:size','integrity:validation')
  AND (NOT diagnostic ? 'day' OR (jsonb_typeof(diagnostic->'day')='number' AND diagnostic->>'day' ~ '^[0-6]$'))
  AND (NOT diagnostic ? 'session' OR (jsonb_typeof(diagnostic->'session')='number' AND diagnostic->>'session' ~ '^([0-9]|1[01])$'))
  AND (NOT diagnostic ? 'block' OR (jsonb_typeof(diagnostic->'block')='number' AND diagnostic->>'block' ~ '^([0-9]|1[0-9]|2[0-3])$'))
  AND (NOT diagnostic ? 'exercise' OR (jsonb_typeof(diagnostic->'exercise')='number' AND diagnostic->>'exercise' ~ '^([0-9]|1[0-9]|2[0-3])$'))
  AND (NOT diagnostic ? 'recovery' OR (diagnostic->'recovery'='true'::jsonb AND NOT diagnostic ? 'exercise'))
  AND (NOT diagnostic ? 'activityId' OR (jsonb_typeof(diagnostic->'activityId')='string' AND diagnostic->>'activityId' ~ '^FQ-ACT-[0-9]{5}$'))
  AND (NOT diagnostic ? 'actualKind' OR (jsonb_typeof(diagnostic->'actualKind')='string' AND diagnostic->>'actualKind' IN ('repetitions','duration','distance','count','invalid')))
  AND (NOT diagnostic ? 'allowedKinds' OR (jsonb_typeof(diagnostic->'allowedKinds')='array' AND jsonb_array_length(diagnostic->'allowedKinds')<=4 AND diagnostic->'allowedKinds' <@ '["repetitions","duration","distance","count"]'::jsonb))
 ),
 PRIMARY KEY(user_id,attempt_id),
 FOREIGN KEY(user_id,attempt_id) REFERENCES fitquest.onboarding_attempts(user_id,id),
 FOREIGN KEY(user_id,plan_id) REFERENCES fitquest.training_plans(user_id,id) ON DELETE CASCADE,
 CHECK(expires_at=created_at+interval '14 days')
);
CREATE INDEX plan_validation_diagnostics_retention ON fitquest.plan_validation_diagnostics(user_id,created_at DESC,attempt_id DESC);
ALTER TABLE fitquest.plan_validation_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.plan_validation_diagnostics FORCE ROW LEVEL SECURITY;
REVOKE ALL ON fitquest.plan_validation_diagnostics FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,DELETE ON fitquest.plan_validation_diagnostics TO fitquest_app;
CREATE POLICY owner_only ON fitquest.plan_validation_diagnostics TO fitquest_app
 USING(user_id=nullif(current_setting('fitquest.user_id',true),'')::uuid)
 WITH CHECK(user_id=nullif(current_setting('fitquest.user_id',true),'')::uuid);
