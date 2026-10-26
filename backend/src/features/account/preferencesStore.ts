import type { Pool, PoolClient } from 'pg';
import type { Account } from './auth.js';
import { OnboardingError } from '../onboarding/onboardingError.js';
import {
  validPreferencesChange,
  type AccountPreferences,
  type PreferencesChange,
} from '../../shared/accountPreferences.js';
export function preferencesStore(pool: Pool) {
  async function tx<T>(a: Account, fn: (c: PoolClient) => Promise<T>) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('fitquest.user_id',$1,true)", [a.userId]);
      if (
        !(
          await c.query('SELECT fitquest.onboarding_session_guard($1,$2) AS active', [
            a.sessionId,
            a.userId,
          ])
        ).rows[0]?.active
      )
        throw new OnboardingError(401, 'session_ended');
      const value = await fn(c);
      await c.query('COMMIT');
      return value;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  async function read(c: PoolClient, a: Account): Promise<AccountPreferences> {
    const r = (
      await c.query(
        'SELECT weight_unit,revision FROM fitquest.account_preferences WHERE user_id=$1',
        [a.userId],
      )
    ).rows[0];
    return r
      ? { weightUnit: r.weight_unit, revision: r.revision }
      : { weightUnit: 'lb', revision: 0 };
  }
  return {
    read: (a: Account) => tx(a, (c) => read(c, a)),
    save(a: Account, change: PreferencesChange) {
      if (!validPreferencesChange(change)) throw new OnboardingError(400, 'invalid_request');
      return tx(a, async (c) => {
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [a.userId]);
        const current = await read(c, a);
        if (current.revision !== change.expectedRevision)
          throw new OnboardingError(409, 'preferences_changed');
        if (current.weightUnit === change.weightUnit) return current;
        const next = { weightUnit: change.weightUnit, revision: current.revision + 1 };
        await c.query(
          'INSERT INTO fitquest.account_preferences(user_id,weight_unit,revision) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET weight_unit=EXCLUDED.weight_unit,revision=EXCLUDED.revision,updated_at=now()',
          [a.userId, next.weightUnit, next.revision],
        );
        return next;
      });
    },
  };
}
export type PreferencesStore = ReturnType<typeof preferencesStore>;
