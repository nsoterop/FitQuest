CREATE SCHEMA m1b;
CREATE TABLE m1b.meta (key text PRIMARY KEY, value text NOT NULL);
CREATE TABLE m1b.migrations (version integer PRIMARY KEY, checksum text NOT NULL);
CREATE TABLE m1b.accounts (
  account_id uuid PRIMARY KEY,
  environment text NOT NULL CHECK (environment = 'm1b.synthetic.local.v1')
);
CREATE TABLE m1b.aggregates (
  account_id uuid NOT NULL REFERENCES m1b.accounts(account_id),
  kind text NOT NULL CHECK (kind IN ('profile', 'session')),
  aggregate_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, kind, aggregate_id)
);
CREATE TABLE m1b.aggregate_revisions (
  account_id uuid NOT NULL REFERENCES m1b.accounts(account_id),
  kind text NOT NULL CHECK (kind IN ('profile', 'session')),
  aggregate_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  operation_id uuid NOT NULL,
  document jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, kind, aggregate_id, revision),
  UNIQUE (account_id, operation_id)
);
CREATE TABLE m1b.operation_outcomes (
  account_id uuid NOT NULL REFERENCES m1b.accounts(account_id),
  operation_id uuid NOT NULL,
  request_hash char(64) NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('profile', 'session')),
  target_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('claimed', 'committed', 'rejected')),
  outcome jsonb,
  terminal_at timestamptz,
  PRIMARY KEY (account_id, operation_id),
  CHECK ((state = 'claimed' AND outcome IS NULL AND terminal_at IS NULL)
      OR (state IN ('committed', 'rejected') AND outcome IS NOT NULL AND terminal_at IS NOT NULL))
);
CREATE INDEX aggregates_sessions_list ON m1b.aggregates
  (account_id, ((document->>'startedAt')) DESC, aggregate_id DESC) WHERE kind = 'session';

ALTER TABLE m1b.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1b.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE m1b.aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1b.aggregates FORCE ROW LEVEL SECURITY;
ALTER TABLE m1b.aggregate_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1b.aggregate_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE m1b.operation_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1b.operation_outcomes FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_accounts ON m1b.accounts TO fitquest_m1b_api
  USING (account_id::text = current_setting('fitquest.owner_id', true));
CREATE POLICY owner_accounts_update ON m1b.accounts FOR UPDATE TO fitquest_m1b_api
  USING (account_id::text = current_setting('fitquest.owner_id', true))
  WITH CHECK (account_id::text = current_setting('fitquest.owner_id', true));
CREATE POLICY owner_aggregates ON m1b.aggregates TO fitquest_m1b_api
  USING (account_id::text = current_setting('fitquest.owner_id', true))
  WITH CHECK (account_id::text = current_setting('fitquest.owner_id', true));
CREATE POLICY owner_revisions ON m1b.aggregate_revisions TO fitquest_m1b_api
  USING (account_id::text = current_setting('fitquest.owner_id', true))
  WITH CHECK (account_id::text = current_setting('fitquest.owner_id', true));
CREATE POLICY owner_operations ON m1b.operation_outcomes TO fitquest_m1b_api
  USING (account_id::text = current_setting('fitquest.owner_id', true))
  WITH CHECK (account_id::text = current_setting('fitquest.owner_id', true));

GRANT USAGE ON SCHEMA m1b TO fitquest_m1b_api;
GRANT SELECT ON m1b.accounts TO fitquest_m1b_api;
GRANT UPDATE (environment) ON m1b.accounts TO fitquest_m1b_api;
GRANT SELECT, INSERT, UPDATE ON m1b.aggregates TO fitquest_m1b_api;
GRANT SELECT, INSERT ON m1b.aggregate_revisions TO fitquest_m1b_api;
GRANT SELECT, INSERT, UPDATE ON m1b.operation_outcomes TO fitquest_m1b_api;
