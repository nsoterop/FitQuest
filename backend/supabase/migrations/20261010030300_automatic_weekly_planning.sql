-- Explicit opt-in only. Enrollment is durable and independent of resettable plans.
CREATE TABLE fitquest.weekly_schedules (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 enabled boolean NOT NULL, revision bigint NOT NULL CHECK(revision>0),
 time_zone text NOT NULL CHECK(length(time_zone) BETWEEN 1 AND 80),
 enabled_at timestamptz NOT NULL, last_week date, error_code text CHECK(length(error_code)<=80)
);
ALTER TABLE fitquest.weekly_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.weekly_schedules FORCE ROW LEVEL SECURITY;
REVOKE ALL ON fitquest.weekly_schedules FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON fitquest.weekly_schedules TO fitquest_app;
CREATE POLICY owner_only ON fitquest.weekly_schedules TO fitquest_app USING(user_id=(SELECT nullif(current_setting('fitquest.user_id',true),'')::uuid)) WITH CHECK(user_id=(SELECT nullif(current_setting('fitquest.user_id',true),'')::uuid));
CREATE INDEX weekly_schedules_enabled ON fitquest.weekly_schedules(user_id) WHERE enabled;
-- Narrow internal discovery only: IDs of explicitly enrolled accounts, keyset paginated.
-- No user tokens, private history, credentials or public RPC access.
CREATE FUNCTION fitquest.weekly_schedule_accounts(after_id uuid) RETURNS TABLE(user_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT s.user_id FROM fitquest.weekly_schedules s WHERE s.enabled AND (after_id IS NULL OR s.user_id>after_id) ORDER BY s.user_id LIMIT 100;
$$;
REVOKE ALL ON FUNCTION fitquest.weekly_schedule_accounts(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION fitquest.weekly_schedule_accounts(uuid) TO fitquest_app;
ALTER TABLE fitquest.training_plans ADD COLUMN scheduled boolean NOT NULL DEFAULT false;
ALTER TABLE fitquest.training_generations ADD COLUMN schedule_revision bigint, ADD COLUMN dispatch_started_at timestamptz;
GRANT UPDATE(schedule_revision,dispatch_started_at) ON fitquest.training_generations TO fitquest_app;
