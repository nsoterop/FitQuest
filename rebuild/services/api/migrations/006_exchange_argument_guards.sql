-- Narrow helpers never treat SQL NULL as matching state/client/time/fence metadata.
-- Strict set-returning helpers produce no rows; void helpers have no side effects.
ALTER FUNCTION m1b.create_exchange_challenge(uuid,text,text,text,char(64),timestamptz,timestamptz) RETURNS NULL ON NULL INPUT;
ALTER FUNCTION m1b.read_exchange_challenge(uuid,text,text) RETURNS NULL ON NULL INPUT;
ALTER FUNCTION m1b.claim_exchange(uuid,text,text,char(64),char(64),char(64),uuid,timestamptz,timestamptz) RETURNS NULL ON NULL INPUT;
ALTER FUNCTION m1b.fail_exchange(uuid,uuid,char(64)) RETURNS NULL ON NULL INPUT;
ALTER FUNCTION m1b.resolve_exchange_account(uuid,uuid,char(64),text,text,timestamptz) RETURNS NULL ON NULL INPUT;
ALTER FUNCTION m1b.complete_exchange(uuid,uuid,char(64),uuid,timestamptz) RETURNS NULL ON NULL INPUT;
