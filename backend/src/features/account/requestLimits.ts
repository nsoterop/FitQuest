import type { Pool } from 'pg';
import type { Account } from './auth.js';
import { OnboardingError } from '../onboarding/onboardingError.js';
export type AccountRequestGuard = (account: Account) => Promise<number>;
export function accountRequestGuard(pool: Pool): AccountRequestGuard {
  return async (account) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('fitquest.user_id',$1,true)", [account.userId]);
      const retry: number = (
        await client.query('SELECT fitquest.take_account_request($1) AS retry', [account.sessionId])
      ).rows[0]?.retry;
      if (!Number.isInteger(retry) || retry < -1 || retry > 3600)
        throw new Error('Invalid request allowance');
      // Validation/handler failures must not roll this counter back.
      await client.query('COMMIT');
      if (retry === -1) throw new OnboardingError(401, 'session_ended');
      return retry;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
}
