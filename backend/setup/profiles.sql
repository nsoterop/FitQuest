-- Non-destructive baseline for a fresh installation only. Historical reset is never executed.
-- FitQuest's application schema is intentionally NOT exposed through PostgREST.
-- Fastify connects as this restricted role, never postgres or service_role.
CREATE SCHEMA fitquest;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='fitquest_app') THEN
    CREATE ROLE fitquest_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSIF EXISTS (SELECT FROM pg_roles WHERE rolname='fitquest_app'
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR NOT rolcanlogin)) THEN
    RAISE EXCEPTION 'Existing fitquest_app role does not meet the restricted backend boundary';
  END IF;
END $$;

CREATE TABLE fitquest.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  first_name text NOT NULL CHECK (length(first_name) BETWEEN 1 AND 100 AND first_name ~ '\S'),
  last_name text NOT NULL CHECK (length(last_name) BETWEEN 1 AND 100 AND last_name ~ '\S'),
  height_inches integer NOT NULL CHECK (height_inches BETWEEN 1 AND 120),
  age integer NOT NULL CHECK (age BETWEEN 1 AND 130),
  weight_lb numeric NOT NULL CHECK (weight_lb > 0 AND weight_lb <= 1500),
  gender text NOT NULL CHECK (length(gender) BETWEEN 1 AND 100 AND gender ~ '\S'),
  age_captured_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fitquest.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY owned_profile ON fitquest.profiles TO fitquest_app
  USING (user_id = nullif(current_setting('fitquest.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('fitquest.user_id', true), '')::uuid);
REVOKE ALL ON SCHEMA fitquest FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON fitquest.profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA fitquest TO fitquest_app;
GRANT SELECT, INSERT, UPDATE ON fitquest.profiles TO fitquest_app;
-- Auth owns its tables/policies. The backend receives only a session verdict,
-- never access to Auth tables. Definer access is limited to this private lookup.
CREATE FUNCTION fitquest.session_active(session_id uuid, account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT account_id = nullif(current_setting('fitquest.user_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM auth.sessions s
      WHERE s.id=session_id AND s.user_id=account_id
        AND (s.not_after IS NULL OR s.not_after > now()));
$$;
REVOKE ALL ON FUNCTION fitquest.session_active(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fitquest.session_active(uuid, uuid) TO fitquest_app;
