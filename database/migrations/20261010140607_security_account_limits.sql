-- Forward-only security policy. Activation is separate from schema application.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE fitquest.security_policy (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  enabled boolean NOT NULL DEFAULT false,
  requests_per_minute integer NOT NULL DEFAULT 120 CHECK(requests_per_minute BETWEEN 1 AND 10000),
  requests_per_hour integer NOT NULL DEFAULT 1200 CHECK(requests_per_hour BETWEEN 1 AND 100000),
  ai_calls_per_day integer NOT NULL DEFAULT 60 CHECK(ai_calls_per_day BETWEEN 1 AND 1000),
  ai_daily_micro bigint NOT NULL DEFAULT 4000000 CHECK(ai_daily_micro BETWEEN 1 AND 7000000),
  ai_lifetime_micro bigint NOT NULL DEFAULT 5000000 CHECK(ai_lifetime_micro BETWEEN 1 AND 7000000)
);
INSERT INTO fitquest.security_policy(id) VALUES(true);
ALTER TABLE fitquest.security_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.security_policy FORCE ROW LEVEL SECURITY;
REVOKE ALL ON fitquest.security_policy FROM PUBLIC,anon,authenticated,service_role,fitquest_app;

-- One expiring counter per existing account. No IPs or request contents.
CREATE TABLE fitquest.account_request_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  minute timestamptz NOT NULL, minute_count integer NOT NULL CHECK(minute_count>=0),
  hour timestamptz NOT NULL, hour_count integer NOT NULL CHECK(hour_count>=0),
  touched_at timestamptz NOT NULL
);
CREATE INDEX account_request_limits_expiry ON fitquest.account_request_limits(touched_at);
ALTER TABLE fitquest.account_request_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.account_request_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY owned ON fitquest.account_request_limits FOR SELECT TO fitquest_app
 USING(user_id=nullif(current_setting('fitquest.user_id',true),'')::uuid);
REVOKE ALL ON fitquest.account_request_limits FROM PUBLIC,anon,authenticated,service_role,fitquest_app;
GRANT SELECT ON fitquest.account_request_limits TO fitquest_app;

-- Return retry seconds. Caller commits this short transaction BEFORE handling the request.
CREATE FUNCTION fitquest.take_account_request(session_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=nullif(current_setting('fitquest.user_id',true),'')::uuid;
 p fitquest.security_policy; r fitquest.account_request_limits;
 tick timestamptz:=clock_timestamp(); m timestamptz; h timestamptz;
BEGIN
 IF owner_id IS NULL OR NOT fitquest.onboarding_session_guard(session_id,owner_id) THEN RETURN -1; END IF;
 SELECT * INTO p FROM fitquest.security_policy WHERE id=true FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing security policy'; END IF;
 IF NOT p.enabled THEN RETURN 0; END IF;
 m:=date_trunc('minute',tick,'UTC'); h:=date_trunc('hour',tick,'UTC');
 INSERT INTO fitquest.account_request_limits VALUES(owner_id,m,1,h,1,tick)
 -- A request that waited for a row lock must never rewind a newer window.
 ON CONFLICT(user_id) DO UPDATE SET minute=greatest(account_request_limits.minute,m),
 hour=greatest(account_request_limits.hour,h),touched_at=greatest(account_request_limits.touched_at,tick),
 minute_count=CASE WHEN account_request_limits.minute>=m THEN least(account_request_limits.minute_count+1,p.requests_per_minute+1) ELSE 1 END,
 hour_count=CASE WHEN account_request_limits.hour>=h THEN least(account_request_limits.hour_count+1,p.requests_per_hour+1) ELSE 1 END
 RETURNING * INTO r;
 tick:=clock_timestamp();
 -- Lock the active counter before cleanup to avoid cycles across expired accounts.
 DELETE FROM fitquest.account_request_limits WHERE user_id IN
  (SELECT user_id FROM fitquest.account_request_limits WHERE touched_at<tick-interval '7 days'
   ORDER BY touched_at LIMIT 100 FOR UPDATE SKIP LOCKED);
 IF r.hour_count>p.requests_per_hour THEN RETURN greatest(1,least(3600,ceil(extract(epoch FROM r.hour+interval '1 hour'-tick))::integer)); END IF;
 IF r.minute_count>p.requests_per_minute THEN RETURN greatest(1,least(60,ceil(extract(epoch FROM r.minute+interval '1 minute'-tick))::integer)); END IF;
 RETURN 0;
END $$;
REVOKE ALL ON FUNCTION fitquest.take_account_request(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION fitquest.take_account_request(uuid) TO fitquest_app;

-- Extend the permanent existing ledger; no second spending balance or reset.
ALTER TABLE fitquest.onboarding_attempts
 ADD COLUMN reserved_at timestamptz,
 ADD COLUMN allowance_denial text CHECK(allowance_denial IN ('account_ai_rate_limit','account_ai_daily_limit','account_ai_lifetime_limit'));
UPDATE fitquest.onboarding_attempts SET reserved_at=created_at WHERE reserved_micro>0;
CREATE INDEX onboarding_attempts_account_reservation ON fitquest.onboarding_attempts(user_id,reserved_at);
-- The app may insert attempt identity, but cannot forge reservation/policy metadata.
REVOKE INSERT ON fitquest.onboarding_attempts FROM fitquest_app;
GRANT INSERT(user_id,id,purpose,state,model,prompt_version,schema_version) ON fitquest.onboarding_attempts TO fitquest_app;

CREATE OR REPLACE FUNCTION fitquest.reserve_onboarding(attempt uuid, maximum_micro bigint, cap_micro bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=nullif(current_setting('fitquest.user_id',true),'')::uuid;
 entry fitquest.onboarding_attempts; budget fitquest.ai_budget; p fitquest.security_policy;
 tick timestamptz; day_start timestamptz;
 used_daily numeric; used_lifetime numeric; calls_today bigint; denial text;
BEGIN
 IF owner_id IS NULL OR maximum_micro IS NULL OR cap_micro IS NULL OR maximum_micro<=0 OR cap_micro<=0 OR cap_micro>7000000 OR maximum_micro>cap_micro THEN RETURN false; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(71629101);
 SELECT * INTO budget FROM fitquest.ai_budget WHERE id=true FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO entry FROM fitquest.onboarding_attempts WHERE user_id=owner_id AND id=attempt AND state='not_dispatched' FOR UPDATE;
 IF NOT FOUND OR (entry.purpose='app' AND NOT budget.app_enabled) THEN RETURN false; END IF;
 UPDATE fitquest.onboarding_attempts SET allowance_denial=NULL WHERE user_id=owner_id AND id=attempt;
 IF budget.spent_micro+budget.reserved_micro+maximum_micro>least(cap_micro,budget.cap_micro) THEN RETURN false; END IF;
 IF entry.purpose='evaluation' AND budget.evaluation_spent_micro+budget.evaluation_reserved_micro+maximum_micro>budget.evaluation_cap_micro THEN RETURN false; END IF;
 SELECT * INTO p FROM fitquest.security_policy WHERE id=true FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Date the reservation after waiting for the existing accounting/policy locks.
 tick:=clock_timestamp();
 IF p.enabled THEN
  day_start:=date_trunc('day',tick,'UTC');
  SELECT count(*) FILTER(WHERE reserved_at>=day_start),
   coalesce(sum(CASE WHEN state IN ('reserved','uncertain') THEN reserved_micro
      WHEN reserved_at>=day_start THEN coalesce(actual_micro,0) ELSE 0 END),0),
   coalesce(sum(CASE WHEN state IN ('reserved','uncertain') THEN reserved_micro ELSE coalesce(actual_micro,0) END),0)
   INTO calls_today,used_daily,used_lifetime
   FROM fitquest.onboarding_attempts WHERE user_id=owner_id AND reserved_at IS NOT NULL;
  IF used_lifetime+maximum_micro>p.ai_lifetime_micro THEN denial:='account_ai_lifetime_limit';
  ELSIF calls_today>=p.ai_calls_per_day THEN denial:='account_ai_rate_limit';
  ELSIF used_daily+maximum_micro>p.ai_daily_micro THEN denial:='account_ai_daily_limit'; END IF;
  IF denial IS NOT NULL THEN
   UPDATE fitquest.onboarding_attempts SET allowance_denial=denial WHERE user_id=owner_id AND id=attempt;
   RETURN false;
  END IF;
 END IF;
 UPDATE fitquest.ai_budget SET reserved_micro=reserved_micro+maximum_micro,
 evaluation_reserved_micro=evaluation_reserved_micro+CASE WHEN entry.purpose='evaluation' THEN maximum_micro ELSE 0 END WHERE id=true;
 UPDATE fitquest.onboarding_attempts SET reserved_micro=maximum_micro,state='reserved',reserved_at=tick,allowance_denial=NULL WHERE user_id=owner_id AND id=attempt;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION fitquest.reserve_onboarding(uuid,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION fitquest.reserve_onboarding(uuid,bigint,bigint) TO fitquest_app;

ALTER TABLE fitquest.food_operations DROP CONSTRAINT food_operations_error_code_check,
 ADD CONSTRAINT food_operations_error_code_check CHECK(error_code IS NULL OR error_code IN
 ('ai_disabled','budget_exhausted','interrupted','provider_error','refused','incomplete','invalid_food','session_ended',
  'account_ai_rate_limit','account_ai_daily_limit','account_ai_lifetime_limit'));
