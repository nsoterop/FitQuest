import { Pool, type PoolClient } from 'pg';
import { fileURLToPath } from 'node:url';
import type { Account } from './auth.js';

export type ProfileInput = {
  firstName: string;
  lastName: string;
  height: { value: number; unit: 'in' };
  age: number;
  weight: { value: number; unit: 'lb' };
  gender: string;
};
export type SavedProfile = ProfileInput & { ageCapturedAt: string; updatedAt: string };
export interface ProfileStore {
  sessionActive(account: Account): Promise<boolean>;
  save(account: Account, profile: ProfileInput): Promise<void>;
  read(account: Account): Promise<SavedProfile | null>;
}

export function createPool(connectionString: string) {
  const connection = new URL(connectionString);
  if (connection.searchParams.get('sslmode') === 'verify-full') {
    // Trust Supabase's published CA while keeping hostname/certificate verification.
    connection.searchParams.set(
      'sslrootcert',
      fileURLToPath(new URL('../certs/supabase-prod-ca-2021.crt', import.meta.url)),
    );
  }
  const pool = new Pool({
    connectionString: connection.toString(),
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    options: '-c statement_timeout=1500 -c lock_timeout=1000',
  });
  pool.on('error', () => {});
  return pool;
}

export function postgresProfileStore(pool: Pool): ProfileStore {
  async function sessionActiveInTransaction(account: Account, client: PoolClient) {
    const result = await client.query('SELECT fitquest.session_active($1, $2) AS active', [
      account.sessionId,
      account.userId,
    ]);
    return result.rows[0]?.active === true;
  }
  async function ownedTransaction<T>(
    account: Account,
    operation: (client: PoolClient) => Promise<T>,
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('fitquest.user_id', $1, true)", [account.userId]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  return {
    sessionActive: (account) =>
      ownedTransaction(account, (client) => sessionActiveInTransaction(account, client)),
    async save(account, profile) {
      await ownedTransaction(account, async (client) => {
        if (!(await sessionActiveInTransaction(account, client))) throw new Error('Session ended.');
        await client.query(
          `INSERT INTO fitquest.profiles
          (user_id, first_name, last_name, height_inches, age, weight_lb, gender, age_captured_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())
          ON CONFLICT (user_id) DO UPDATE SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
          height_inches=EXCLUDED.height_inches, age=EXCLUDED.age, weight_lb=EXCLUDED.weight_lb,
          gender=EXCLUDED.gender, age_captured_at=EXCLUDED.age_captured_at, updated_at=EXCLUDED.updated_at`,
          [
            account.userId,
            profile.firstName,
            profile.lastName,
            profile.height.value,
            profile.age,
            profile.weight.value,
            profile.gender,
          ],
        );
      });
    },
    async read(account) {
      return ownedTransaction(account, async (client) => {
        if (!(await sessionActiveInTransaction(account, client))) throw new Error('Session ended.');
        const result = await client.query('SELECT * FROM fitquest.profiles WHERE user_id=$1', [
          account.userId,
        ]);
        const row = result.rows[0];
        return row
          ? {
              firstName: row.first_name,
              lastName: row.last_name,
              height: { value: row.height_inches, unit: 'in' as const },
              age: row.age,
              weight: { value: Number(row.weight_lb), unit: 'lb' as const },
              gender: row.gender,
              ageCapturedAt: row.age_captured_at.toISOString(),
              updatedAt: row.updated_at.toISOString(),
            }
          : null;
      });
    },
  };
}
