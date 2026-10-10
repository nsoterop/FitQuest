-- Additive profile date; existing birthdays remain unknown and records are retained.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE fitquest.profiles ADD COLUMN birthday date
 CHECK(birthday >= DATE '0001-01-01' AND birthday <= (now() AT TIME ZONE 'UTC')::date);
ALTER TABLE fitquest.profiles DROP CONSTRAINT profiles_age_check;
ALTER TABLE fitquest.profiles ADD CONSTRAINT profiles_age_check
 CHECK(age BETWEEN 1 AND 130 OR (birthday IS NOT NULL AND age=0));
CREATE FUNCTION fitquest.profile_age(legacy_age integer,birthday date,as_of date DEFAULT (now() AT TIME ZONE 'UTC')::date)
RETURNS integer LANGUAGE sql STABLE SET search_path=''
AS $$ SELECT CASE WHEN birthday IS NULL THEN legacy_age
 ELSE extract(year FROM pg_catalog.age(as_of::timestamp,birthday::timestamp))::integer END $$;
REVOKE ALL ON FUNCTION fitquest.profile_age(integer,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION fitquest.profile_age(integer,date,date) TO fitquest_app;
