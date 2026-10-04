-- Independent of conversation/plan content; no credentials, health text or raw error bodies.
ALTER TABLE fitquest.onboarding_attempts ADD COLUMN provider_diagnostic jsonb
  CHECK (provider_diagnostic IS NULL OR (
    jsonb_typeof(provider_diagnostic)='object'
    AND octet_length(provider_diagnostic::text)<=350
    AND provider_diagnostic - ARRAY['httpStatus','code','requestId','transport'] = '{}'::jsonb
    AND (NOT provider_diagnostic ? 'httpStatus' OR
      (jsonb_typeof(provider_diagnostic->'httpStatus')='number' AND (provider_diagnostic->>'httpStatus') ~ '^[1-5][0-9]{2}$'))
    AND (NOT provider_diagnostic ? 'requestId' OR
      (jsonb_typeof(provider_diagnostic->'requestId')='string' AND (provider_diagnostic->>'requestId') ~ '^req_[a-zA-Z0-9_-]{1,100}$'))
    AND (NOT provider_diagnostic ? 'code' OR provider_diagnostic->>'code' IN
      ('invalid_json_schema','invalid_request_error','rate_limit_exceeded','insufficient_quota','invalid_api_key','model_not_found','server_error','context_length_exceeded','unsupported_parameter','invalid_value'))
    AND (NOT provider_diagnostic ? 'transport' OR provider_diagnostic->>'transport' IN
      ('aborted','network','invalid_response','response_limit','invalid_request'))
  ));
GRANT UPDATE(provider_diagnostic) ON fitquest.onboarding_attempts TO fitquest_app;
