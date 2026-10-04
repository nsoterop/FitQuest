// Only bounded operational fields may cross the provider boundary. Never retain messages/bodies.
export const providerCodes=['invalid_json_schema','invalid_request_error','rate_limit_exceeded','insufficient_quota','invalid_api_key','model_not_found','server_error','context_length_exceeded','unsupported_parameter','invalid_value'] as const;
export type ProviderDiagnostic={httpStatus?:number;code?:typeof providerCodes[number];requestId?:string;transport?:'aborted'|'network'|'invalid_response'|'response_limit'|'invalid_request'};
export function safeDiagnostic(value:ProviderDiagnostic):ProviderDiagnostic {
  return {...(Number.isInteger(value.httpStatus)&&value.httpStatus!>=100&&value.httpStatus!<=599?{httpStatus:value.httpStatus}:{}),
    ...(providerCodes.includes(value.code!)?{code:value.code}:{}),
    ...(typeof value.requestId==='string'&&/^req_[a-zA-Z0-9_-]{1,100}$/.test(value.requestId)?{requestId:value.requestId}:{}),
    ...(['aborted','network','invalid_response','response_limit','invalid_request'].includes(value.transport!)?{transport:value.transport}:{})};
}
