// Provider wire constraints differ from local Ajv constraints. Preserve the strict
// local validators; only this projection is sent to Structured Outputs.
export function providerSchema(value:unknown):unknown {
  if(Array.isArray(value))return value.map(providerSchema);
  if(!value||typeof value!=='object')return value;
  const result=Object.fromEntries(Object.entries(value).filter(([key])=>key!=='uniqueItems').map(([key,item])=>[key,providerSchema(item)]));
  if(result.type==='object'&&result.properties)result.required=Object.keys(result.properties as object);
  return result;
}
