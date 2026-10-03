-- Forward-only preparation. Local synthetic tests only; hosted application data is untouched.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE fitquest.onboarding_conversations (
  user_id uuid NOT NULL REFERENCES auth.users(id), id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 240),
  state text NOT NULL DEFAULT 'collecting' CHECK (state IN ('collecting','confirmed')),
  confirmed_revision integer, disclosure_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,id), UNIQUE (user_id),
  CHECK (state <> 'confirmed' OR confirmed_revision IS NOT NULL)
);
CREATE TABLE fitquest.onboarding_context_revisions (
  user_id uuid NOT NULL, conversation_id uuid NOT NULL, revision integer NOT NULL CHECK (revision BETWEEN 0 AND 240),
  context jsonb NOT NULL CHECK (jsonb_typeof(context)='object' AND octet_length(context::text)<=48000),
  profile_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,conversation_id,revision),
  FOREIGN KEY (user_id,conversation_id) REFERENCES fitquest.onboarding_conversations ON DELETE CASCADE
);
ALTER TABLE fitquest.onboarding_conversations ADD CONSTRAINT confirmed_context_exists
  FOREIGN KEY(user_id,id,confirmed_revision) REFERENCES fitquest.onboarding_context_revisions(user_id,conversation_id,revision)
  DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE fitquest.onboarding_turns (
  user_id uuid NOT NULL, conversation_id uuid NOT NULL, id uuid NOT NULL, sequence integer NOT NULL,
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 4000),
  reply text CHECK (length(reply)<=3000), question_topic text CHECK (length(question_topic)<=80),
  state text NOT NULL CHECK (state IN ('pending','completed','failed')),
  error_code text CHECK (length(error_code)<=50), attempt_id uuid, deadline timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,conversation_id,id), UNIQUE (user_id,conversation_id,sequence),
  FOREIGN KEY (user_id,conversation_id) REFERENCES fitquest.onboarding_conversations ON DELETE CASCADE
);
CREATE UNIQUE INDEX onboarding_one_pending ON fitquest.onboarding_turns(user_id,conversation_id) WHERE state='pending';
CREATE TABLE fitquest.onboarding_operations (
  user_id uuid NOT NULL, conversation_id uuid NOT NULL, id uuid NOT NULL,
  digest text NOT NULL CHECK (length(digest)=64), kind text NOT NULL CHECK (kind IN ('message','retry','skip','edit','confirm')),
  turn_id uuid, attempt_id uuid, result_revision integer NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','completed','failed')), error_code text,
  PRIMARY KEY (user_id,conversation_id,id),
  FOREIGN KEY (user_id,conversation_id) REFERENCES fitquest.onboarding_conversations ON DELETE CASCADE,
  FOREIGN KEY (user_id,conversation_id,turn_id) REFERENCES fitquest.onboarding_turns(user_id,conversation_id,id)
);
-- No conversation/Auth FK: deleting content must never erase unsettled liabilities.
CREATE TABLE fitquest.onboarding_attempts (
  user_id uuid NOT NULL, id uuid NOT NULL, purpose text NOT NULL DEFAULT 'app' CHECK(purpose IN ('app','evaluation')),
  reserved_micro bigint NOT NULL DEFAULT 0 CHECK (reserved_micro>=0),
  actual_micro bigint CHECK (actual_micro>=0),
  state text NOT NULL CHECK (state IN ('reserved','settled','uncertain','not_dispatched')),
  model text NOT NULL CHECK (length(model)<=80), prompt_version text NOT NULL CHECK(length(prompt_version)<=80), schema_version text NOT NULL CHECK(length(schema_version)<=80),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,id)
);
CREATE INDEX onboarding_attempts_time ON fitquest.onboarding_attempts(created_at);
CREATE TABLE fitquest.onboarding_request_limits (
  user_id uuid PRIMARY KEY, hour timestamptz NOT NULL, requests integer NOT NULL CHECK(requests>=0),
  day date NOT NULL, generations integer NOT NULL CHECK(generations>=0)
);
-- One non-renewing allowance. Never prune/reset this row, including when content is deleted.
-- Application dispatch stays locked until HQ carries evaluation liabilities into the activation DB.
CREATE TABLE fitquest.ai_budget (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  cap_micro bigint NOT NULL DEFAULT 7000000 CHECK(cap_micro BETWEEN 1 AND 7000000),
  evaluation_cap_micro bigint NOT NULL DEFAULT 250000 CHECK(evaluation_cap_micro BETWEEN 1 AND 250000),
  spent_micro bigint NOT NULL DEFAULT 0 CHECK(spent_micro>=0),
  reserved_micro bigint NOT NULL DEFAULT 0 CHECK(reserved_micro>=0),
  evaluation_spent_micro bigint NOT NULL DEFAULT 0 CHECK(evaluation_spent_micro>=0),
  evaluation_reserved_micro bigint NOT NULL DEFAULT 0 CHECK(evaluation_reserved_micro>=0),
  app_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO fitquest.ai_budget(id) VALUES(true);
ALTER TABLE fitquest.ai_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.ai_budget FORCE ROW LEVEL SECURITY;
REVOKE ALL ON fitquest.ai_budget FROM PUBLIC,anon,authenticated,service_role,fitquest_app;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['onboarding_conversations','onboarding_context_revisions','onboarding_turns','onboarding_operations','onboarding_attempts','onboarding_request_limits'] LOOP
    EXECUTE format('ALTER TABLE fitquest.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE fitquest.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY owned ON fitquest.%I TO fitquest_app USING (user_id=nullif(current_setting(''fitquest.user_id'',true),'''')::uuid) WITH CHECK (user_id=nullif(current_setting(''fitquest.user_id'',true),'''')::uuid)',table_name);
    EXECUTE format('REVOKE ALL ON fitquest.%I FROM PUBLIC,anon,authenticated,service_role',table_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON fitquest.%I TO fitquest_app',table_name);
  END LOOP;
END $$;
GRANT DELETE ON fitquest.onboarding_conversations TO fitquest_app;
-- Immutable revisions and operation digests; operational rows cannot be deleted by the app.
REVOKE UPDATE ON fitquest.onboarding_context_revisions,fitquest.onboarding_operations FROM fitquest_app;
GRANT UPDATE(result_revision,status,error_code) ON fitquest.onboarding_operations TO fitquest_app;
REVOKE UPDATE ON fitquest.onboarding_attempts FROM fitquest_app;

-- Lock only the verified session during short content transactions so sign-out and commit serialize.
-- No connection or Auth lock is held during provider work; settlement needs no active session.
CREATE FUNCTION fitquest.onboarding_session_guard(session_id uuid, account_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF account_id IS DISTINCT FROM nullif(current_setting('fitquest.user_id',true),'')::uuid THEN RETURN false; END IF;
  PERFORM 1 FROM auth.sessions WHERE id=session_id AND user_id=account_id AND (not_after IS NULL OR not_after>now()) FOR SHARE;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION fitquest.onboarding_session_guard(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION fitquest.onboarding_session_guard(uuid,uuid) TO fitquest_app;

-- Narrow definer functions serialize the application-wide budget without granting global table access.
CREATE FUNCTION fitquest.reserve_onboarding(attempt uuid, maximum_micro bigint, cap_micro bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=nullif(current_setting('fitquest.user_id',true),'')::uuid;
  entry fitquest.onboarding_attempts; budget fitquest.ai_budget;
BEGIN
  IF owner_id IS NULL OR maximum_micro IS NULL OR cap_micro IS NULL OR maximum_micro<=0 OR cap_micro<=0 OR cap_micro>7000000 OR maximum_micro>cap_micro THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(71629101);
  SELECT * INTO budget FROM fitquest.ai_budget WHERE id=true FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF; -- Missing accounting must never initialize a fresh allowance.
  SELECT * INTO entry FROM fitquest.onboarding_attempts WHERE user_id=owner_id AND id=attempt AND state='not_dispatched' FOR UPDATE;
  IF NOT FOUND OR (entry.purpose='app' AND NOT budget.app_enabled) THEN RETURN false; END IF;
  IF budget.spent_micro+budget.reserved_micro+maximum_micro>least(cap_micro,budget.cap_micro) THEN RETURN false; END IF;
  IF entry.purpose='evaluation' AND budget.evaluation_spent_micro+budget.evaluation_reserved_micro+maximum_micro>budget.evaluation_cap_micro THEN RETURN false; END IF;
  UPDATE fitquest.ai_budget SET reserved_micro=reserved_micro+maximum_micro,
    evaluation_reserved_micro=evaluation_reserved_micro+CASE WHEN entry.purpose='evaluation' THEN maximum_micro ELSE 0 END WHERE id=true;
  UPDATE fitquest.onboarding_attempts SET reserved_micro=maximum_micro,state='reserved' WHERE user_id=owner_id AND id=attempt;
  RETURN true;
END $$;
CREATE FUNCTION fitquest.settle_onboarding(attempt uuid, charged_micro bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=nullif(current_setting('fitquest.user_id',true),'')::uuid; entry fitquest.onboarding_attempts;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(71629101);
  SELECT * INTO entry FROM fitquest.onboarding_attempts WHERE user_id=owner_id AND id=attempt FOR UPDATE;
  IF NOT FOUND OR entry.actual_micro IS NOT NULL OR entry.state='not_dispatched' THEN RETURN; END IF;
  IF charged_micro IS NULL THEN
    UPDATE fitquest.onboarding_attempts SET state='uncertain' WHERE user_id=owner_id AND id=attempt;
    RETURN; -- Keep the full reservation; never assume a timeout was free.
  END IF;
  IF charged_micro<0 THEN RAISE EXCEPTION 'Invalid accounting'; END IF;
  UPDATE fitquest.ai_budget SET spent_micro=spent_micro+charged_micro,reserved_micro=reserved_micro-entry.reserved_micro,
    evaluation_spent_micro=evaluation_spent_micro+CASE WHEN entry.purpose='evaluation' THEN charged_micro ELSE 0 END,
    evaluation_reserved_micro=evaluation_reserved_micro-CASE WHEN entry.purpose='evaluation' THEN entry.reserved_micro ELSE 0 END WHERE id=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing accounting'; END IF;
  UPDATE fitquest.onboarding_attempts SET actual_micro=charged_micro,state='settled' WHERE user_id=owner_id AND id=attempt;
END $$;
REVOKE ALL ON FUNCTION fitquest.reserve_onboarding(uuid,bigint,bigint),fitquest.settle_onboarding(uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION fitquest.reserve_onboarding(uuid,bigint,bigint),fitquest.settle_onboarding(uuid,bigint) TO fitquest_app;
