-- M1c.4b isolated exchange target ONLY; 001–004 remain immutable.
ALTER TABLE m1b.accounts DROP CONSTRAINT accounts_environment_check;
ALTER TABLE m1b.accounts ADD CONSTRAINT accounts_environment_check CHECK (environment IN
  ('m1b.synthetic.local.v1','m1c3.synthetic.test.v1','m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1'));
ALTER TABLE m1b.provider_identities DROP CONSTRAINT provider_identities_provider_check;
ALTER TABLE m1b.provider_identities DROP CONSTRAINT provider_identities_issuer_check;
ALTER TABLE m1b.provider_identities ADD CONSTRAINT provider_namespace CHECK
  ((provider='synthetic_verified' AND issuer='fitquest-m1c3-test') OR
   (provider='apple_simulated' AND issuer='https://appleid.apple.com'));

CREATE TABLE m1b.auth_challenges (
  challenge_id uuid PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1')),
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 255),
  nonce text NOT NULL CHECK (nonce ~ '^[a-f0-9]{64}$'),
  state_hash char(64) NOT NULL CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes')
);
CREATE TABLE m1b.auth_exchange_attempts (
  challenge_id uuid PRIMARY KEY REFERENCES m1b.auth_challenges(challenge_id),
  attempt_id uuid NOT NULL UNIQUE,
  request_digest char(64) NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  subject_hash char(64) NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  -- Captured coordinates are not authority. No FK here: claiming must not lock an account after a challenge.
  expected_account_id uuid,
  expected_epoch bigint NOT NULL CHECK (expected_epoch > 0),
  claimed_at timestamptz NOT NULL,
  deadline timestamptz NOT NULL CHECK (deadline > claimed_at AND deadline <= claimed_at + interval '30 seconds'),
  status text NOT NULL CHECK (status IN ('claimed','completed','failed')),
  completed_family_id uuid UNIQUE REFERENCES m1b.session_families(family_id),
  CHECK ((status='completed') = (completed_family_id IS NOT NULL))
);
ALTER TABLE m1b.auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1b.auth_challenges FORCE ROW LEVEL SECURITY;
ALTER TABLE m1b.auth_exchange_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1b.auth_exchange_attempts FORCE ROW LEVEL SECURITY;
-- No direct table policy/grant on either pre-auth table; all access uses fixed-path helpers.

CREATE FUNCTION m1b.create_exchange_challenge(p_id uuid,p_env text,p_client text,p_nonce text,p_state char(64),p_now timestamptz,p_expiry timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,m1b AS $$
  INSERT INTO m1b.auth_challenges VALUES(p_id,p_env,p_client,p_nonce,p_state,p_now,p_expiry)
$$;
CREATE FUNCTION m1b.read_exchange_challenge(p_id uuid,p_env text,p_client text)
RETURNS TABLE(nonce text,state_hash char(64),expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,m1b AS $$
  SELECT c.nonce,c.state_hash,c.expires_at FROM m1b.auth_challenges c
  WHERE c.challenge_id=p_id AND c.environment=p_env AND c.client_id=p_client
$$;

CREATE FUNCTION m1b.claim_exchange(p_id uuid,p_env text,p_client text,p_state char(64),p_digest char(64),p_subject char(64),p_attempt uuid,p_now timestamptz,p_deadline timestamptz)
RETURNS TABLE(outcome text,attempt_id uuid,deadline timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,m1b AS $$
DECLARE c m1b.auth_challenges; a m1b.auth_exchange_attempts; identity_account uuid; account_epoch bigint:=1; account_status text;
BEGIN
  IF p_digest IS NULL OR p_subject IS NULL OR p_digest !~ '^[a-f0-9]{64}$' OR p_subject !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid exchange digest';
  END IF;
  -- Same identity-resolution guard as finalization, BEFORE challenge/attempt locks.
  PERFORM pg_advisory_xact_lock(hashtextextended('apple_simulated:https://appleid.apple.com:'||p_subject,913));
  SELECT i.account_id,ac.authorization_epoch,ac.status INTO identity_account,account_epoch,account_status
    FROM m1b.provider_identities i JOIN m1b.accounts ac USING(account_id)
    WHERE i.provider='apple_simulated' AND i.issuer='https://appleid.apple.com' AND i.subject_hash=p_subject AND ac.environment=p_env;
  account_epoch:=coalesce(account_epoch,1);
  SELECT * INTO c FROM m1b.auth_challenges WHERE challenge_id=p_id FOR UPDATE;
  IF NOT FOUND OR c.environment<>p_env OR c.client_id<>p_client OR c.state_hash<>p_state THEN
    RETURN QUERY SELECT 'AUTH_INVALID',NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  IF c.expires_at<=p_now THEN RETURN QUERY SELECT 'AUTH_REAUTH_REQUIRED',NULL::uuid,NULL::timestamptz; RETURN; END IF;
  SELECT * INTO a FROM m1b.auth_exchange_attempts WHERE challenge_id=p_id FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN a.request_digest<>p_digest THEN 'AUTH_CHALLENGE_REUSED'
      WHEN a.status='claimed' AND a.deadline>p_now THEN 'AUTH_EXCHANGE_IN_PROGRESS' ELSE 'AUTH_REAUTH_REQUIRED' END,a.attempt_id,a.deadline;
    RETURN;
  END IF;
  IF account_status='disabled' THEN RETURN QUERY SELECT 'SESSION_REVOKED',NULL::uuid,NULL::timestamptz; RETURN; END IF;
  IF p_attempt IS NULL OR p_deadline<=p_now OR p_deadline>c.expires_at THEN RAISE EXCEPTION 'Invalid attempt deadline'; END IF;
  INSERT INTO m1b.auth_exchange_attempts(challenge_id,attempt_id,request_digest,subject_hash,expected_account_id,expected_epoch,claimed_at,deadline,status)
    VALUES(p_id,p_attempt,p_digest,p_subject,identity_account,account_epoch,p_now,p_deadline,'claimed');
  RETURN QUERY SELECT 'claimed',p_attempt,p_deadline;
END $$;

CREATE FUNCTION m1b.fail_exchange(p_id uuid,p_attempt uuid,p_digest char(64))
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,m1b AS $$
  UPDATE m1b.auth_exchange_attempts SET status='failed'
  WHERE challenge_id=p_id AND attempt_id=p_attempt AND request_digest=p_digest AND status='claimed'
$$;

CREATE FUNCTION m1b.resolve_exchange_account(p_id uuid,p_attempt uuid,p_digest char(64),p_env text,p_client text,p_now timestamptz)
RETURNS TABLE(account_id uuid,expected_epoch bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,m1b AS $$
DECLARE a m1b.auth_exchange_attempts; c m1b.auth_challenges; found_account uuid; ac m1b.accounts;
BEGIN
  -- Non-locking fenced read first; account is always locked before attempt completion.
  SELECT * INTO a FROM m1b.auth_exchange_attempts WHERE challenge_id=p_id AND attempt_id=p_attempt AND request_digest=p_digest AND status='claimed';
  IF NOT FOUND OR a.deadline<=p_now THEN RETURN; END IF;
  SELECT * INTO c FROM m1b.auth_challenges WHERE challenge_id=p_id AND environment=p_env AND client_id=p_client AND expires_at>p_now;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('apple_simulated:https://appleid.apple.com:'||a.subject_hash,913));
  SELECT i.account_id INTO found_account FROM m1b.provider_identities i
    WHERE i.provider='apple_simulated' AND i.issuer='https://appleid.apple.com' AND i.subject_hash=a.subject_hash;
  IF found_account IS NULL THEN
    IF a.expected_account_id IS NOT NULL THEN RETURN; END IF;
    found_account:=gen_random_uuid();
    INSERT INTO m1b.accounts(account_id,environment) VALUES(found_account,p_env);
    INSERT INTO m1b.provider_identities(provider,issuer,subject_hash,account_id) VALUES('apple_simulated','https://appleid.apple.com',a.subject_hash,found_account);
  END IF;
  SELECT * INTO ac FROM m1b.accounts WHERE m1b.accounts.account_id=found_account FOR UPDATE;
  IF ac.environment<>p_env OR ac.status<>'active' OR ac.authorization_epoch<>a.expected_epoch
    OR (a.expected_account_id IS NOT NULL AND a.expected_account_id<>found_account) THEN RETURN; END IF;
  RETURN QUERY SELECT found_account,a.expected_epoch;
END $$;

CREATE FUNCTION m1b.complete_exchange(p_id uuid,p_attempt uuid,p_digest char(64),p_family uuid,p_now timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,m1b AS $$
DECLARE a m1b.auth_exchange_attempts; c m1b.auth_challenges; f m1b.session_families; ac m1b.accounts;
BEGIN
  -- Caller has already locked account and inserted its pending family/generation/capability.
  SELECT * INTO f FROM m1b.session_families WHERE family_id=p_family AND account_id::text=current_setting('fitquest.owner_id',true);
  IF NOT FOUND OR f.status<>'pending' OR f.current_generation<>1 THEN RETURN false; END IF;
  SELECT * INTO ac FROM m1b.accounts WHERE account_id=f.account_id;
  SELECT * INTO c FROM m1b.auth_challenges WHERE challenge_id=p_id FOR UPDATE;
  SELECT * INTO a FROM m1b.auth_exchange_attempts WHERE challenge_id=p_id FOR UPDATE;
  IF a.attempt_id IS DISTINCT FROM p_attempt OR a.request_digest IS DISTINCT FROM p_digest OR a.status IS DISTINCT FROM 'claimed'
    OR a.deadline<=p_now OR c.expires_at<=p_now OR c.environment<>ac.environment
    OR ac.status<>'active' OR ac.authorization_epoch<>a.expected_epoch OR f.authorization_epoch<>a.expected_epoch
    OR (a.expected_account_id IS NOT NULL AND a.expected_account_id<>f.account_id)
    OR NOT EXISTS(SELECT 1 FROM m1b.provider_identities i WHERE i.provider='apple_simulated' AND i.issuer='https://appleid.apple.com' AND i.subject_hash=a.subject_hash AND i.account_id=f.account_id)
    THEN RETURN false; END IF;
  UPDATE m1b.auth_exchange_attempts SET status='completed',completed_family_id=p_family WHERE challenge_id=p_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION m1b.create_exchange_challenge(uuid,text,text,text,char(64),timestamptz,timestamptz),
  m1b.read_exchange_challenge(uuid,text,text),m1b.claim_exchange(uuid,text,text,char(64),char(64),char(64),uuid,timestamptz,timestamptz),
  m1b.fail_exchange(uuid,uuid,char(64)),m1b.resolve_exchange_account(uuid,uuid,char(64),text,text,timestamptz),
  m1b.complete_exchange(uuid,uuid,char(64),uuid,timestamptz) FROM PUBLIC;
GRANT USAGE ON SCHEMA m1b TO fitquest_m1c4b_preauth,fitquest_m1c4b_api,fitquest_m1c4b_lookup;
GRANT EXECUTE ON FUNCTION m1b.create_exchange_challenge(uuid,text,text,text,char(64),timestamptz,timestamptz),
  m1b.read_exchange_challenge(uuid,text,text),m1b.claim_exchange(uuid,text,text,char(64),char(64),char(64),uuid,timestamptz,timestamptz),
  m1b.fail_exchange(uuid,uuid,char(64)) TO fitquest_m1c4b_preauth;
GRANT EXECUTE ON FUNCTION m1b.resolve_exchange_account(uuid,uuid,char(64),text,text,timestamptz),
  m1b.complete_exchange(uuid,uuid,char(64),uuid,timestamptz) TO fitquest_m1c4b_api;
GRANT EXECUTE ON FUNCTION m1b.lookup_access(char(64)),m1b.lookup_refresh(char(64)),m1b.lookup_revocation(char(64)) TO fitquest_m1c4b_lookup;
GRANT SELECT ON m1b.accounts TO fitquest_m1c4b_api;
GRANT UPDATE(lock_guard) ON m1b.accounts TO fitquest_m1c4b_api;
GRANT SELECT,INSERT,UPDATE ON m1b.aggregates,m1b.operation_outcomes TO fitquest_m1c4b_api;
GRANT SELECT,INSERT ON m1b.aggregate_revisions,m1b.session_families,m1b.credential_generations,m1b.revocation_capabilities TO fitquest_m1c4b_api;
GRANT UPDATE(status,current_generation,revoked_at) ON m1b.session_families TO fitquest_m1c4b_api;
GRANT UPDATE(status,consumed_operation_id,consumed_at) ON m1b.credential_generations TO fitquest_m1c4b_api;
GRANT SELECT ON m1b.meta TO fitquest_m1c4b_api,fitquest_m1c4b_lookup;

CREATE POLICY exchange_accounts ON m1b.accounts TO fitquest_m1c4b_api
  USING(account_id::text=current_setting('fitquest.owner_id',true) AND environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1'))
  WITH CHECK(account_id::text=current_setting('fitquest.owner_id',true) AND environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1'));
CREATE POLICY exchange_aggregates ON m1b.aggregates TO fitquest_m1c4b_api
  USING(account_id::text=current_setting('fitquest.owner_id',true)) WITH CHECK(account_id::text=current_setting('fitquest.owner_id',true));
CREATE POLICY exchange_revisions ON m1b.aggregate_revisions TO fitquest_m1c4b_api
  USING(account_id::text=current_setting('fitquest.owner_id',true)) WITH CHECK(account_id::text=current_setting('fitquest.owner_id',true));
CREATE POLICY exchange_operations ON m1b.operation_outcomes TO fitquest_m1c4b_api
  USING(account_id::text=current_setting('fitquest.owner_id',true)) WITH CHECK(account_id::text=current_setting('fitquest.owner_id',true));
CREATE POLICY exchange_families ON m1b.session_families TO fitquest_m1c4b_api
  USING(account_id::text=current_setting('fitquest.owner_id',true)) WITH CHECK(account_id::text=current_setting('fitquest.owner_id',true));
CREATE POLICY exchange_generations ON m1b.credential_generations TO fitquest_m1c4b_api
  USING(account_id::text=current_setting('fitquest.owner_id',true)) WITH CHECK(account_id::text=current_setting('fitquest.owner_id',true));
CREATE POLICY exchange_capabilities ON m1b.revocation_capabilities TO fitquest_m1c4b_api
  USING(account_id::text=current_setting('fitquest.owner_id',true)) WITH CHECK(account_id::text=current_setting('fitquest.owner_id',true));

-- SQL isolation also holds outside the bound repository facade.
CREATE POLICY fitquest_m1c4b_api_aggregates_environment ON m1b.aggregates AS RESTRICTIVE TO fitquest_m1c4b_api
  USING(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=aggregates.account_id AND ac.environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1')))
  WITH CHECK(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=aggregates.account_id AND ac.environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1')));
CREATE POLICY fitquest_m1c4b_api_aggregate_revisions_environment ON m1b.aggregate_revisions AS RESTRICTIVE TO fitquest_m1c4b_api
  USING(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=aggregate_revisions.account_id AND ac.environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1')))
  WITH CHECK(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=aggregate_revisions.account_id AND ac.environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1')));
CREATE POLICY fitquest_m1c4b_api_operation_outcomes_environment ON m1b.operation_outcomes AS RESTRICTIVE TO fitquest_m1c4b_api
  USING(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=operation_outcomes.account_id AND ac.environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1')))
  WITH CHECK(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=operation_outcomes.account_id AND ac.environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1')));
CREATE POLICY fitquest_m1c4b_api_session_families_environment ON m1b.session_families AS RESTRICTIVE TO fitquest_m1c4b_api
  USING(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=session_families.account_id AND ac.environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1')))
  WITH CHECK(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=session_families.account_id AND ac.environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1')));
CREATE POLICY fitquest_m1c4b_api_credential_generations_environment ON m1b.credential_generations AS RESTRICTIVE TO fitquest_m1c4b_api
  USING(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=credential_generations.account_id AND ac.environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1')))
  WITH CHECK(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=credential_generations.account_id AND ac.environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1')));
CREATE POLICY fitquest_m1c4b_api_revocation_capabilities_environment ON m1b.revocation_capabilities AS RESTRICTIVE TO fitquest_m1c4b_api
  USING(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=revocation_capabilities.account_id AND ac.environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1')))
  WITH CHECK(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=revocation_capabilities.account_id AND ac.environment IN ('m1c4b.synthetic.test.v1','m1c4b.synthetic.other.v1')));
CREATE POLICY fitquest_m1c3_api_aggregates_environment ON m1b.aggregates AS RESTRICTIVE TO fitquest_m1c3_api
  USING(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=aggregates.account_id AND ac.environment IN ('m1c3.synthetic.test.v1')))
  WITH CHECK(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=aggregates.account_id AND ac.environment IN ('m1c3.synthetic.test.v1')));
CREATE POLICY fitquest_m1c3_api_aggregate_revisions_environment ON m1b.aggregate_revisions AS RESTRICTIVE TO fitquest_m1c3_api
  USING(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=aggregate_revisions.account_id AND ac.environment IN ('m1c3.synthetic.test.v1')))
  WITH CHECK(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=aggregate_revisions.account_id AND ac.environment IN ('m1c3.synthetic.test.v1')));
CREATE POLICY fitquest_m1c3_api_operation_outcomes_environment ON m1b.operation_outcomes AS RESTRICTIVE TO fitquest_m1c3_api
  USING(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=operation_outcomes.account_id AND ac.environment IN ('m1c3.synthetic.test.v1')))
  WITH CHECK(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=operation_outcomes.account_id AND ac.environment IN ('m1c3.synthetic.test.v1')));
CREATE POLICY fitquest_m1c3_api_session_families_environment ON m1b.session_families AS RESTRICTIVE TO fitquest_m1c3_api
  USING(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=session_families.account_id AND ac.environment IN ('m1c3.synthetic.test.v1')))
  WITH CHECK(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=session_families.account_id AND ac.environment IN ('m1c3.synthetic.test.v1')));
CREATE POLICY fitquest_m1c3_api_credential_generations_environment ON m1b.credential_generations AS RESTRICTIVE TO fitquest_m1c3_api
  USING(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=credential_generations.account_id AND ac.environment IN ('m1c3.synthetic.test.v1')))
  WITH CHECK(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=credential_generations.account_id AND ac.environment IN ('m1c3.synthetic.test.v1')));
CREATE POLICY fitquest_m1c3_api_revocation_capabilities_environment ON m1b.revocation_capabilities AS RESTRICTIVE TO fitquest_m1c3_api
  USING(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=revocation_capabilities.account_id AND ac.environment IN ('m1c3.synthetic.test.v1')))
  WITH CHECK(EXISTS(SELECT 1 FROM m1b.accounts ac WHERE ac.account_id=revocation_capabilities.account_id AND ac.environment IN ('m1c3.synthetic.test.v1')));
CREATE POLICY old_auth_accounts_environment ON m1b.accounts AS RESTRICTIVE TO fitquest_m1c3_api
  USING(environment='m1c3.synthetic.test.v1') WITH CHECK(environment='m1c3.synthetic.test.v1');
