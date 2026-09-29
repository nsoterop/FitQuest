-- Isolated M1c.3 auth-test target only. Migrations 001/002 remain immutable.
ALTER TABLE m1b.accounts DROP CONSTRAINT accounts_environment_check;
ALTER TABLE m1b.accounts ADD CONSTRAINT accounts_environment_check
  CHECK (environment IN ('m1b.synthetic.local.v1', 'm1c3.synthetic.test.v1'));
ALTER TABLE m1b.accounts ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'));
ALTER TABLE m1b.accounts ADD COLUMN authorization_epoch bigint NOT NULL DEFAULT 1 CHECK (authorization_epoch > 0);
ALTER TABLE m1b.accounts ADD COLUMN lock_guard smallint NOT NULL DEFAULT 0 CHECK (lock_guard = 0);
REVOKE UPDATE (environment) ON m1b.accounts FROM fitquest_m1b_api;
GRANT UPDATE (lock_guard) ON m1b.accounts TO fitquest_m1b_api;

CREATE TABLE m1b.provider_identities (
  provider text NOT NULL CHECK (provider = 'synthetic_verified'),
  issuer text NOT NULL CHECK (issuer = 'fitquest-m1c3-test'),
  subject_hash char(64) NOT NULL,
  account_id uuid NOT NULL REFERENCES m1b.accounts(account_id),
  PRIMARY KEY (provider, issuer, subject_hash)
);
CREATE INDEX provider_identities_account ON m1b.provider_identities(account_id);

CREATE TABLE m1b.session_families (
  family_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES m1b.accounts(account_id),
  authorization_epoch bigint NOT NULL CHECK (authorization_epoch > 0),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
  current_generation integer NOT NULL CHECK (current_generation > 0),
  absolute_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (account_id, family_id),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX session_families_account ON m1b.session_families(account_id);

CREATE TABLE m1b.credential_generations (
  account_id uuid NOT NULL,
  family_id uuid NOT NULL,
  generation integer NOT NULL CHECK (generation > 0),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'consumed')),
  access_hash char(64) NOT NULL UNIQUE,
  access_expires_at timestamptz NOT NULL,
  refresh_hash char(64) NOT NULL UNIQUE,
  refresh_expires_at timestamptz NOT NULL,
  activation_expires_at timestamptz NOT NULL,
  consumed_operation_id uuid,
  consumed_at timestamptz,
  PRIMARY KEY (family_id, generation),
  FOREIGN KEY (account_id, family_id) REFERENCES m1b.session_families(account_id, family_id),
  CHECK ((consumed_operation_id IS NULL) = (consumed_at IS NULL)),
  CHECK (activation_expires_at <= access_expires_at AND access_expires_at <= refresh_expires_at),
  CHECK (status = 'consumed' OR consumed_operation_id IS NULL)
);
CREATE INDEX credential_generations_account ON m1b.credential_generations(account_id, family_id);

CREATE TABLE m1b.revocation_capabilities (
  capability_hash char(64) PRIMARY KEY,
  account_id uuid NOT NULL,
  family_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (account_id, family_id) REFERENCES m1b.session_families(account_id, family_id)
);
CREATE INDEX revocation_capabilities_family ON m1b.revocation_capabilities(account_id, family_id);

ALTER TABLE m1b.provider_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1b.provider_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE m1b.session_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1b.session_families FORCE ROW LEVEL SECURITY;
ALTER TABLE m1b.credential_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1b.credential_generations FORCE ROW LEVEL SECURITY;
ALTER TABLE m1b.revocation_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1b.revocation_capabilities FORCE ROW LEVEL SECURITY;

CREATE POLICY auth_accounts ON m1b.accounts TO fitquest_m1c3_api
  USING (account_id::text = current_setting('fitquest.owner_id', true));
CREATE POLICY auth_accounts_lock ON m1b.accounts FOR UPDATE TO fitquest_m1c3_api
  USING (account_id::text = current_setting('fitquest.owner_id', true))
  WITH CHECK (account_id::text = current_setting('fitquest.owner_id', true));
CREATE POLICY auth_aggregates ON m1b.aggregates TO fitquest_m1c3_api
  USING (account_id::text = current_setting('fitquest.owner_id', true))
  WITH CHECK (account_id::text = current_setting('fitquest.owner_id', true));
CREATE POLICY auth_revisions ON m1b.aggregate_revisions TO fitquest_m1c3_api
  USING (account_id::text = current_setting('fitquest.owner_id', true))
  WITH CHECK (account_id::text = current_setting('fitquest.owner_id', true));
CREATE POLICY auth_operations ON m1b.operation_outcomes TO fitquest_m1c3_api
  USING (account_id::text = current_setting('fitquest.owner_id', true))
  WITH CHECK (account_id::text = current_setting('fitquest.owner_id', true));
CREATE POLICY auth_families ON m1b.session_families TO fitquest_m1c3_api
  USING (account_id::text = current_setting('fitquest.owner_id', true))
  WITH CHECK (account_id::text = current_setting('fitquest.owner_id', true));
CREATE POLICY auth_generations ON m1b.credential_generations TO fitquest_m1c3_api
  USING (account_id::text = current_setting('fitquest.owner_id', true))
  WITH CHECK (account_id::text = current_setting('fitquest.owner_id', true));
CREATE POLICY auth_revocations ON m1b.revocation_capabilities TO fitquest_m1c3_api
  USING (account_id::text = current_setting('fitquest.owner_id', true))
  WITH CHECK (account_id::text = current_setting('fitquest.owner_id', true));

-- The original fixture role cannot select newly named accounts or their domain rows.
CREATE POLICY fixture_accounts_only ON m1b.accounts AS RESTRICTIVE FOR SELECT TO fitquest_m1b_api
  USING (environment = 'm1b.synthetic.local.v1');
CREATE POLICY fixture_aggregates_only ON m1b.aggregates AS RESTRICTIVE TO fitquest_m1b_api
  USING (EXISTS (SELECT 1 FROM m1b.accounts a WHERE a.account_id = aggregates.account_id AND a.environment = 'm1b.synthetic.local.v1'))
  WITH CHECK (EXISTS (SELECT 1 FROM m1b.accounts a WHERE a.account_id = aggregates.account_id AND a.environment = 'm1b.synthetic.local.v1'));
CREATE POLICY fixture_revisions_only ON m1b.aggregate_revisions AS RESTRICTIVE TO fitquest_m1b_api
  USING (EXISTS (SELECT 1 FROM m1b.accounts a WHERE a.account_id = aggregate_revisions.account_id AND a.environment = 'm1b.synthetic.local.v1'))
  WITH CHECK (EXISTS (SELECT 1 FROM m1b.accounts a WHERE a.account_id = aggregate_revisions.account_id AND a.environment = 'm1b.synthetic.local.v1'));
CREATE POLICY fixture_operations_only ON m1b.operation_outcomes AS RESTRICTIVE TO fitquest_m1b_api
  USING (EXISTS (SELECT 1 FROM m1b.accounts a WHERE a.account_id = operation_outcomes.account_id AND a.environment = 'm1b.synthetic.local.v1'))
  WITH CHECK (EXISTS (SELECT 1 FROM m1b.accounts a WHERE a.account_id = operation_outcomes.account_id AND a.environment = 'm1b.synthetic.local.v1'));

GRANT USAGE ON SCHEMA m1b TO fitquest_m1c3_api, fitquest_m1c3_lookup;
GRANT SELECT ON m1b.accounts TO fitquest_m1c3_api;
GRANT UPDATE (lock_guard) ON m1b.accounts TO fitquest_m1c3_api;
GRANT SELECT, INSERT, UPDATE ON m1b.aggregates TO fitquest_m1c3_api;
GRANT SELECT, INSERT ON m1b.aggregate_revisions TO fitquest_m1c3_api;
GRANT SELECT, INSERT, UPDATE ON m1b.operation_outcomes TO fitquest_m1c3_api;
GRANT SELECT, INSERT, UPDATE ON m1b.session_families, m1b.credential_generations TO fitquest_m1c3_api;
GRANT SELECT, INSERT ON m1b.revocation_capabilities TO fitquest_m1c3_api;
GRANT SELECT ON m1b.meta TO fitquest_m1c3_api, fitquest_m1c3_lookup;

-- The trusted synthetic identity boundary calls this function, never a public route.
CREATE FUNCTION m1b.resolve_test_identity(p_provider text, p_issuer text, p_subject_hash char(64))
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, m1b AS $$
DECLARE found uuid;
BEGIN
  IF p_provider <> 'synthetic_verified' OR p_issuer <> 'fitquest-m1c3-test' OR p_subject_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid synthetic identity';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_provider || ':' || p_issuer || ':' || p_subject_hash, 913));
  SELECT account_id INTO found FROM m1b.provider_identities
    WHERE provider = p_provider AND issuer = p_issuer AND subject_hash = p_subject_hash;
  IF found IS NOT NULL THEN RETURN found; END IF;
  found := gen_random_uuid();
  INSERT INTO m1b.accounts(account_id, environment) VALUES(found, 'm1c3.synthetic.test.v1');
  INSERT INTO m1b.provider_identities(provider, issuer, subject_hash, account_id)
    VALUES(p_provider, p_issuer, p_subject_hash, found);
  RETURN found;
END $$;
REVOKE ALL ON FUNCTION m1b.resolve_test_identity(text,text,char(64)) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m1b.resolve_test_identity(text,text,char(64)) TO fitquest_m1c3_api;

-- Candidate lookup reveals only row coordinates. It grants no athlete-table access.
CREATE FUNCTION m1b.lookup_access(p_hash char(64))
RETURNS TABLE(account_id uuid, family_id uuid, generation integer)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, m1b AS $$
  SELECT g.account_id, g.family_id, g.generation FROM m1b.credential_generations g WHERE g.access_hash = p_hash
$$;
CREATE FUNCTION m1b.lookup_refresh(p_hash char(64))
RETURNS TABLE(account_id uuid, family_id uuid, generation integer)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, m1b AS $$
  SELECT g.account_id, g.family_id, g.generation FROM m1b.credential_generations g WHERE g.refresh_hash = p_hash
$$;
CREATE FUNCTION m1b.lookup_revocation(p_hash char(64))
RETURNS TABLE(account_id uuid, family_id uuid, generation integer)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, m1b AS $$
  SELECT c.account_id, c.family_id, 0 FROM m1b.revocation_capabilities c WHERE c.capability_hash = p_hash
$$;
REVOKE ALL ON FUNCTION m1b.lookup_access(char(64)), m1b.lookup_refresh(char(64)), m1b.lookup_revocation(char(64)) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m1b.lookup_access(char(64)), m1b.lookup_refresh(char(64)), m1b.lookup_revocation(char(64)) TO fitquest_m1c3_lookup;
