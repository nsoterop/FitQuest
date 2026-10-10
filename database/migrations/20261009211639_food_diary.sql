SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE fitquest.food_entries (
 user_id uuid NOT NULL REFERENCES auth.users(id), id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), consumed_date date NOT NULL,
 document jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz, undo_until timestamptz,
 PRIMARY KEY(user_id,id),
 CHECK(document IS NULL OR (jsonb_typeof(document)='object' AND octet_length(document::text)<=24000)),
 CHECK((deleted_at IS NULL AND undo_until IS NULL AND document IS NOT NULL) OR (deleted_at IS NOT NULL AND undo_until=deleted_at+interval '30 seconds'))
);
CREATE INDEX food_entries_date ON fitquest.food_entries(user_id,consumed_date,id);
CREATE TABLE fitquest.food_days (
 user_id uuid NOT NULL REFERENCES auth.users(id), date date NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), complete boolean NOT NULL DEFAULT false,
 PRIMARY KEY(user_id,date)
);
CREATE TABLE fitquest.food_operations (
 user_id uuid NOT NULL REFERENCES auth.users(id), id uuid NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'), kind text NOT NULL CHECK(kind IN('interpret','save','delete','undo','complete')),
 status text NOT NULL CHECK(status IN('pending','completed','failed')), error_code text,
 candidate jsonb, message text, previous_operation uuid,
 entry_id uuid, attempt_id uuid, created_at timestamptz NOT NULL DEFAULT now(), deadline timestamptz,
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,attempt_id) REFERENCES fitquest.onboarding_attempts(user_id,id),
 FOREIGN KEY(user_id,entry_id) REFERENCES fitquest.food_entries(user_id,id),
 FOREIGN KEY(user_id,previous_operation) REFERENCES fitquest.food_operations(user_id,id),
 CHECK(message IS NULL OR length(message)<=4000),
 CHECK(candidate IS NULL OR (jsonb_typeof(candidate)='object' AND octet_length(candidate::text)<=24000)),
 CHECK(error_code IS NULL OR error_code IN('ai_disabled','budget_exhausted','interrupted','provider_error','refused','incomplete','invalid_food','session_ended'))
);
CREATE INDEX food_operations_pending ON fitquest.food_operations(user_id,deadline) WHERE status='pending';
CREATE INDEX food_operations_retention ON fitquest.food_operations(user_id,created_at);
ALTER TABLE fitquest.food_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.food_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE fitquest.food_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.food_days FORCE ROW LEVEL SECURITY;
ALTER TABLE fitquest.food_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.food_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON fitquest.food_entries,fitquest.food_days,fitquest.food_operations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON fitquest.food_entries,fitquest.food_days,fitquest.food_operations TO fitquest_app;
CREATE POLICY owner_only ON fitquest.food_entries TO fitquest_app USING(user_id=nullif(current_setting('fitquest.user_id',true),'')::uuid) WITH CHECK(user_id=nullif(current_setting('fitquest.user_id',true),'')::uuid);
CREATE POLICY owner_only ON fitquest.food_days TO fitquest_app USING(user_id=nullif(current_setting('fitquest.user_id',true),'')::uuid) WITH CHECK(user_id=nullif(current_setting('fitquest.user_id',true),'')::uuid);
CREATE POLICY owner_only ON fitquest.food_operations TO fitquest_app USING(user_id=nullif(current_setting('fitquest.user_id',true),'')::uuid) WITH CHECK(user_id=nullif(current_setting('fitquest.user_id',true),'')::uuid);
