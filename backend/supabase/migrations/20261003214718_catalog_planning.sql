-- Additive only. Reuse the existing allowance and accounting functions; no budget writes.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE fitquest.onboarding_conversations ADD COLUMN time_zone text NOT NULL DEFAULT 'UTC' CHECK(length(time_zone)<=80);
CREATE TABLE fitquest.training_summaries (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id), revision integer NOT NULL CHECK(revision>0),
  document jsonb NOT NULL CHECK(jsonb_typeof(document)='array' AND octet_length(document::text)<=12000),
  time_zone text NOT NULL CHECK(length(time_zone)<=80), source_conversation uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE fitquest.training_plans (
  user_id uuid NOT NULL REFERENCES auth.users(id), id uuid NOT NULL, summary_revision integer NOT NULL,
  summary jsonb NOT NULL CHECK(octet_length(summary::text)<=12000), time_zone text NOT NULL,
  dates jsonb NOT NULL CHECK(jsonb_array_length(dates)=7), catalog_version text NOT NULL,
  outline jsonb CHECK(octet_length(outline::text)<=20000), created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,id), UNIQUE(user_id,summary_revision)
);
CREATE TABLE fitquest.training_days (
  user_id uuid NOT NULL, plan_id uuid NOT NULL, date date NOT NULL,
  summary_revision integer NOT NULL, detail jsonb NOT NULL CHECK(octet_length(detail::text)<=64000),
  PRIMARY KEY(user_id,plan_id,date), FOREIGN KEY(user_id,plan_id) REFERENCES fitquest.training_plans(user_id,id) ON DELETE CASCADE
);
CREATE TABLE fitquest.training_generations (
  user_id uuid NOT NULL, plan_id uuid NOT NULL, target text NOT NULL CHECK(length(target)<=20),
  status text NOT NULL CHECK(status IN ('pending','completed','failed')), error_code text,
  attempt_id uuid NOT NULL, deadline timestamptz NOT NULL, profile_version text NOT NULL,
  summary_revision integer NOT NULL, PRIMARY KEY(user_id,plan_id,target),
  FOREIGN KEY(user_id,plan_id) REFERENCES fitquest.training_plans(user_id,id) ON DELETE CASCADE
);
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['training_summaries','training_plans','training_days','training_generations'] LOOP
    EXECUTE format('ALTER TABLE fitquest.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('ALTER TABLE fitquest.%I FORCE ROW LEVEL SECURITY',name);
    EXECUTE format('REVOKE ALL ON fitquest.%I FROM PUBLIC,anon,authenticated,service_role',name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON fitquest.%I TO fitquest_app',name);
    EXECUTE format('CREATE POLICY owner_only ON fitquest.%I TO fitquest_app USING (user_id=nullif(current_setting(''fitquest.user_id'',true),'''')::uuid) WITH CHECK (user_id=nullif(current_setting(''fitquest.user_id'',true),'''')::uuid)',name);
  END LOOP;
END $$;
-- Saved prescriptions are immutable through the restricted application role.
REVOKE DELETE ON fitquest.training_summaries,fitquest.training_plans,fitquest.training_days,fitquest.training_generations FROM fitquest_app;
REVOKE UPDATE ON fitquest.training_days,fitquest.training_plans FROM fitquest_app;
GRANT UPDATE(outline) ON fitquest.training_plans TO fitquest_app;
