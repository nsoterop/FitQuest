SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE fitquest.body_weights (
 user_id uuid NOT NULL REFERENCES auth.users(id), id uuid NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 measurement jsonb CHECK(measurement IS NULL OR (jsonb_typeof(measurement)='object' AND octet_length(measurement::text)<=2000)),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
 PRIMARY KEY(user_id,id),CHECK((measurement IS NULL)=(deleted_at IS NOT NULL))
);
CREATE INDEX body_weights_history ON fitquest.body_weights(user_id,(measurement->>'date') DESC,created_at DESC,id) WHERE deleted_at IS NULL;
CREATE TABLE fitquest.body_weight_operations (
 user_id uuid NOT NULL REFERENCES auth.users(id),id uuid NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),entry_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,entry_id) REFERENCES fitquest.body_weights(user_id,id)
);
CREATE INDEX body_weight_operations_entry ON fitquest.body_weight_operations(user_id,entry_id);
-- No relationships to resettable planning tables and no profile backfill.
ALTER TABLE fitquest.body_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.body_weights FORCE ROW LEVEL SECURITY;
ALTER TABLE fitquest.body_weight_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.body_weight_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON fitquest.body_weights,fitquest.body_weight_operations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON fitquest.body_weights TO fitquest_app;
GRANT UPDATE(revision,measurement,updated_at,deleted_at) ON fitquest.body_weights TO fitquest_app;
GRANT SELECT,INSERT ON fitquest.body_weight_operations TO fitquest_app;
CREATE POLICY owner_only ON fitquest.body_weights TO fitquest_app USING(user_id=(SELECT nullif(current_setting('fitquest.user_id',true),'')::uuid)) WITH CHECK(user_id=(SELECT nullif(current_setting('fitquest.user_id',true),'')::uuid));
CREATE POLICY owner_only ON fitquest.body_weight_operations TO fitquest_app USING(user_id=(SELECT nullif(current_setting('fitquest.user_id',true),'')::uuid)) WITH CHECK(user_id=(SELECT nullif(current_setting('fitquest.user_id',true),'')::uuid));
