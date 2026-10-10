-- Additive review state. Existing plans remain legacy, never retrospectively accepted.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE fitquest.training_plans
  ADD COLUMN review_state text NOT NULL DEFAULT 'legacy' CHECK(review_state IN ('legacy','draft','accepted')),
  ADD COLUMN review_revision integer NOT NULL DEFAULT 0 CHECK(review_revision BETWEEN 0 AND 1000000),
  ADD COLUMN review_note text CHECK(length(review_note)<=600),
  ADD COLUMN review_context jsonb CHECK(octet_length(review_context::text)<=8000);
ALTER TABLE fitquest.training_plans ALTER COLUMN review_state SET DEFAULT 'draft';
ALTER TABLE fitquest.training_generations ADD COLUMN feedback text CHECK(length(feedback)<=2000),
  ADD COLUMN feedback_hash text CHECK(feedback_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE fitquest.training_summaries ADD COLUMN preferences jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(preferences)='array' AND jsonb_array_length(preferences)<=6 AND octet_length(preferences::text)<=3000);
-- Ownership policies, forced RLS and existing role restrictions stay in force.
-- Only validated review publication can update detail; date/owner/plan keys stay immutable.
GRANT UPDATE(detail) ON fitquest.training_days TO fitquest_app;
GRANT UPDATE(review_state,review_revision,review_note,review_context,summary_revision) ON fitquest.training_plans TO fitquest_app;
