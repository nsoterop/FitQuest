-- Relax only the date-count constraint; existing dated plans and JSON stay unchanged.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE fitquest.training_plans DROP CONSTRAINT training_plans_dates_check;
ALTER TABLE fitquest.training_plans ADD CONSTRAINT training_plans_dates_check
  CHECK(jsonb_typeof(dates)='array' AND jsonb_array_length(dates) BETWEEN 1 AND 7);
