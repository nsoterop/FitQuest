-- Preserve verbatim intake and private plain responses within existing owner-scoped storage.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE fitquest.onboarding_context_revisions DROP CONSTRAINT onboarding_context_revisions_context_check;
ALTER TABLE fitquest.onboarding_context_revisions ADD CONSTRAINT onboarding_context_revisions_context_check CHECK(jsonb_typeof(context)='object' AND octet_length(context::text)<=96000);
ALTER TABLE fitquest.training_summaries DROP CONSTRAINT training_summaries_document_check;
ALTER TABLE fitquest.training_summaries ADD CONSTRAINT training_summaries_document_check CHECK(jsonb_typeof(document)='array' AND octet_length(document::text)<=96000);
ALTER TABLE fitquest.training_plans DROP CONSTRAINT training_plans_summary_check;
ALTER TABLE fitquest.training_plans ADD CONSTRAINT training_plans_summary_check CHECK(octet_length(summary::text)<=96000);
ALTER TABLE fitquest.training_plans DROP CONSTRAINT training_plans_outline_check;
ALTER TABLE fitquest.training_plans ADD CONSTRAINT training_plans_outline_check CHECK(octet_length(outline::text)<=256000);
ALTER TABLE fitquest.training_generations ADD COLUMN raw_response text CHECK(octet_length(raw_response)<=64000);
