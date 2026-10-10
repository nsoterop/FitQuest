-- Existing private tables and owner RLS remain authoritative. No consent/data backfill.
ALTER TABLE fitquest.profiles ADD COLUMN history_consent jsonb CHECK(history_consent IS NULL OR octet_length(history_consent::text)<=1000);
GRANT UPDATE(history_consent) ON fitquest.profiles TO fitquest_app;
ALTER TABLE fitquest.training_plans ADD COLUMN week_start date,
 ADD COLUMN next_operation uuid, ADD COLUMN progress_snapshot jsonb CHECK(progress_snapshot IS NULL OR octet_length(progress_snapshot::text)<=400000);
ALTER TABLE fitquest.training_plans DROP CONSTRAINT training_plans_user_id_summary_revision_key;
CREATE UNIQUE INDEX training_initial_revision ON fitquest.training_plans(user_id,summary_revision) WHERE week_start IS NULL;
CREATE UNIQUE INDEX training_next_week ON fitquest.training_plans(user_id,week_start) WHERE week_start IS NOT NULL;
CREATE UNIQUE INDEX training_next_operation ON fitquest.training_plans(user_id,next_operation) WHERE next_operation IS NOT NULL;
ALTER TABLE fitquest.training_plans ADD CONSTRAINT next_week_identity CHECK(week_start IS NULL AND next_operation IS NULL AND progress_snapshot IS NULL OR week_start IS NOT NULL AND next_operation IS NOT NULL AND progress_snapshot IS NOT NULL AND dates->>0=week_start::text);
ALTER TABLE fitquest.training_generations ADD COLUMN progress_snapshot jsonb CHECK(progress_snapshot IS NULL OR octet_length(progress_snapshot::text)<=400000);
GRANT UPDATE(progress_snapshot) ON fitquest.training_plans,fitquest.training_generations TO fitquest_app;
CREATE INDEX journal_progress_dates ON fitquest.workout_journals(user_id,(document->>'performedDate'),id);
