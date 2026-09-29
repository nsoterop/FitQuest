-- Additive correction in the same isolated M1c.3 auth-test target.
ALTER TABLE m1b.credential_generations ADD CONSTRAINT consumed_status_matches_operation
  CHECK ((status = 'consumed') = (consumed_operation_id IS NOT NULL));
CREATE UNIQUE INDEX consumed_refresh_operation_unique ON m1b.credential_generations(account_id, consumed_operation_id)
  WHERE consumed_operation_id IS NOT NULL;

REVOKE UPDATE ON m1b.session_families, m1b.credential_generations FROM fitquest_m1c3_api;
GRANT UPDATE (status, current_generation, revoked_at) ON m1b.session_families TO fitquest_m1c3_api;
GRANT UPDATE (status, consumed_operation_id, consumed_at) ON m1b.credential_generations TO fitquest_m1c3_api;
