SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE fitquest.food_library (
 user_id uuid NOT NULL REFERENCES auth.users(id),id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=24000),
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,id)
);
CREATE TABLE fitquest.food_library_operations (
 user_id uuid NOT NULL REFERENCES auth.users(id),id uuid NOT NULL,digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 library_id uuid NOT NULL,entry_id uuid,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,library_id) REFERENCES fitquest.food_library(user_id,id),
 FOREIGN KEY(user_id,entry_id) REFERENCES fitquest.food_entries(user_id,id)
);
CREATE INDEX food_library_operations_library ON fitquest.food_library_operations(user_id,library_id);
CREATE INDEX food_library_operations_entry ON fitquest.food_library_operations(user_id,entry_id) WHERE entry_id IS NOT NULL;
ALTER TABLE fitquest.food_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.food_library FORCE ROW LEVEL SECURITY;
ALTER TABLE fitquest.food_library_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.food_library_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON fitquest.food_library,fitquest.food_library_operations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON fitquest.food_library TO fitquest_app;
GRANT SELECT,INSERT ON fitquest.food_library_operations TO fitquest_app;
CREATE POLICY owner_only ON fitquest.food_library TO fitquest_app USING(user_id=nullif(current_setting('fitquest.user_id',true),'')::uuid) WITH CHECK(user_id=nullif(current_setting('fitquest.user_id',true),'')::uuid);
CREATE POLICY owner_only ON fitquest.food_library_operations TO fitquest_app USING(user_id=nullif(current_setting('fitquest.user_id',true),'')::uuid) WITH CHECK(user_id=nullif(current_setting('fitquest.user_id',true),'')::uuid);
