-- M1c.4b F1: pre-auth account denial has no known FitQuest family to revoke.
-- Replace only the denial code; retain 006 strict arguments, fixed path and existing ACL/owner.
CREATE OR REPLACE FUNCTION m1b.claim_exchange(p_id uuid,p_env text,p_client text,p_state char(64),p_digest char(64),p_subject char(64),p_attempt uuid,p_now timestamptz,p_deadline timestamptz)
RETURNS TABLE(outcome text,attempt_id uuid,deadline timestamptz)
LANGUAGE plpgsql STRICT SECURITY DEFINER SET search_path=pg_catalog,m1b AS $$
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
  IF account_status='disabled' THEN RETURN QUERY SELECT 'AUTH_INVALID',NULL::uuid,NULL::timestamptz; RETURN; END IF;
  IF p_attempt IS NULL OR p_deadline<=p_now OR p_deadline>c.expires_at THEN RAISE EXCEPTION 'Invalid attempt deadline'; END IF;
  INSERT INTO m1b.auth_exchange_attempts(challenge_id,attempt_id,request_digest,subject_hash,expected_account_id,expected_epoch,claimed_at,deadline,status)
    VALUES(p_id,p_attempt,p_digest,p_subject,identity_account,account_epoch,p_now,p_deadline,'claimed');
  RETURN QUERY SELECT 'claimed',p_attempt,p_deadline;
END $$;
