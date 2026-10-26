-- Additive, account-owned display/input preference. Existing records retain their units.
CREATE TABLE fitquest.account_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_unit text NOT NULL CHECK (weight_unit IN ('lb','kg')),
  revision integer NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fitquest.account_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitquest.account_preferences FORCE ROW LEVEL SECURITY;
REVOKE ALL ON fitquest.account_preferences FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON fitquest.account_preferences TO fitquest_app;
GRANT UPDATE(weight_unit, revision, updated_at) ON fitquest.account_preferences TO fitquest_app;
CREATE POLICY owner_only ON fitquest.account_preferences TO fitquest_app
USING (user_id=(SELECT nullif(current_setting('fitquest.user_id',true),'')::uuid))
WITH CHECK (user_id=(SELECT nullif(current_setting('fitquest.user_id',true),'')::uuid));
