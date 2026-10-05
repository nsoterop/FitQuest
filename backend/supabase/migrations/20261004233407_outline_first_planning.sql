-- Existing saved plans retain their original generation/review semantics.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE fitquest.training_plans
  ADD COLUMN outline_first boolean NOT NULL DEFAULT false,
  ADD COLUMN confirmed_outline_revision integer CHECK(confirmed_outline_revision BETWEEN 1 AND 1000000);
GRANT UPDATE(confirmed_outline_revision) ON fitquest.training_plans TO fitquest_app;
