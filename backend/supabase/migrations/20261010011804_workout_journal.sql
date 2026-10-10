SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE fitquest.workout_journals (
 user_id uuid NOT NULL REFERENCES auth.users(id),id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),
 source_key text CHECK(source_key IS NULL OR source_key ~ '^[0-9a-f]{64}$'),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=256000),
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=128000),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,id)
);
-- Provenance is a snapshot, deliberately not a foreign key to resettable planning tables.
CREATE INDEX workout_journals_history ON fitquest.workout_journals(user_id,updated_at DESC,id);
CREATE INDEX workout_journals_source ON fitquest.workout_journals(user_id,source_key,created_at DESC,id) WHERE source_key IS NOT NULL;
CREATE TABLE fitquest.workout_journal_operations (
 user_id uuid NOT NULL REFERENCES auth.users(id),id uuid NOT NULL,digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 journal_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,journal_id) REFERENCES fitquest.workout_journals(user_id,id)
);
CREATE INDEX workout_journal_operations_journal ON fitquest.workout_journal_operations(user_id,journal_id);
ALTER TABLE fitquest.workout_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.workout_journals FORCE ROW LEVEL SECURITY;
ALTER TABLE fitquest.workout_journal_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.workout_journal_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON fitquest.workout_journals,fitquest.workout_journal_operations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON fitquest.workout_journals TO fitquest_app;
GRANT UPDATE(revision,document,updated_at) ON fitquest.workout_journals TO fitquest_app;
GRANT SELECT,INSERT ON fitquest.workout_journal_operations TO fitquest_app;
CREATE POLICY owner_only ON fitquest.workout_journals TO fitquest_app USING(user_id=(SELECT nullif(current_setting('fitquest.user_id',true),'')::uuid)) WITH CHECK(user_id=(SELECT nullif(current_setting('fitquest.user_id',true),'')::uuid));
CREATE POLICY owner_only ON fitquest.workout_journal_operations TO fitquest_app USING(user_id=(SELECT nullif(current_setting('fitquest.user_id',true),'')::uuid)) WITH CHECK(user_id=(SELECT nullif(current_setting('fitquest.user_id',true),'')::uuid));
ALTER TABLE fitquest.training_plans DROP CONSTRAINT training_plans_schema_version_check,
 ADD CONSTRAINT training_plans_schema_version_check CHECK(schema_version IS NULL OR schema_version IN ('complete-week-v1','document-week-v1','document-week-v2','document-week-v3','document-week-v4')),
 DROP CONSTRAINT training_plans_document_version_check,
 ADD CONSTRAINT training_plans_document_version_check CHECK(document_plan IS NULL OR (schema_version IS NOT NULL AND schema_version IN ('document-week-v1','document-week-v2','document-week-v3','document-week-v4') AND jsonb_typeof(document_plan)='object' AND octet_length(document_plan::text)<=512000));
ALTER TABLE fitquest.plan_validation_diagnostics DROP CONSTRAINT plan_validation_diagnostics_schema_version_check,
 ADD CONSTRAINT plan_validation_diagnostics_schema_version_check CHECK(schema_version IN ('complete-week-v1','document-week-v1','document-week-v2','document-week-v3','document-week-v4'));
