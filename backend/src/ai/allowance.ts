import type { PoolClient } from 'pg';
// One reservation function and one permanent ledger for every AI caller.
export async function reserveAI(
  client: PoolClient,
  attempt: string,
  maximumMicro: number,
  capMicro: number,
): Promise<string | undefined> {
  const reserved = (
    await client.query('SELECT fitquest.reserve_onboarding($1,$2,$3) AS allowed', [
      attempt,
      maximumMicro,
      capMicro,
    ])
  ).rows[0]?.allowed;
  if (reserved) return;
  const code: unknown = (
    await client.query('SELECT allowance_denial FROM fitquest.onboarding_attempts WHERE id=$1', [
      attempt,
    ])
  ).rows[0]?.allowance_denial;
  return typeof code === 'string' &&
    ['account_ai_rate_limit', 'account_ai_daily_limit', 'account_ai_lifetime_limit'].includes(code)
    ? code
    : 'budget_exhausted';
}
