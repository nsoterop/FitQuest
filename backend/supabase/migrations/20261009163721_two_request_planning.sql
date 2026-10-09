-- Additive stage checkpoint; old jobs and canonical plans remain unchanged.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE fitquest.training_generations
  ADD COLUMN complete_stage text CHECK(complete_stage IS NULL OR complete_stage IN ('outline','workouts')),
  ADD COLUMN outline_attempt_id uuid,
  ADD CONSTRAINT generation_outline_attempt FOREIGN KEY(user_id,outline_attempt_id) REFERENCES fitquest.onboarding_attempts(user_id,id);
-- raw_response already stores a private bounded first response. It is never sent in complete-plan API reads.
