import { isDocumentVersion } from './shared/documentPlanContract.js';
import type { Pool } from 'pg';
import type { Account } from './auth.js';
import type { PlanningWork } from './planningStore.js';
import { safeValidationDiagnostic } from './planDiagnostics.js';
import { catalog } from './activityCatalog.js';
import { completePlanVersion } from './shared/completePlanContract.js';

// Operational records are independent of charge settlement and generation jobs.
// Bound to the latest 50 failures/account; expired records are pruned on writes.
export async function recordPlanDiagnostic(
  pool: Pool,
  a: Account,
  w: PlanningWork,
  value: unknown,
) {
  let c;
  try {
    const diagnostic = safeValidationDiagnostic(value);
    if (!diagnostic) return;
    const sha = process.env.RENDER_GIT_COMMIT;
    c = await pool.connect();
    await c.query('BEGIN');
    await c.query("SET LOCAL statement_timeout='2s'; SET LOCAL lock_timeout='1s'");
    await c.query("SELECT set_config('fitquest.user_id',$1,true)", [a.userId]);
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [a.userId]);
    await c.query(
      'DELETE FROM fitquest.plan_validation_diagnostics WHERE user_id=$1 AND expires_at<=now()',
      [a.userId],
    );
    await c.query(
      `INSERT INTO fitquest.plan_validation_diagnostics(user_id,attempt_id,plan_id,diagnostic,deployment_sha,catalog_version,schema_version)
   VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [
        a.userId,
        w.attempt,
        w.planId,
        diagnostic,
        typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha) ? sha : null,
        isDocumentVersion(w.input.schemaVersion) ? 'not-applicable' : catalog.version,
        w.input.schemaVersion ?? completePlanVersion,
      ],
    );
    await c.query(
      `DELETE FROM fitquest.plan_validation_diagnostics WHERE user_id=$1 AND attempt_id IN
   (SELECT attempt_id FROM fitquest.plan_validation_diagnostics WHERE user_id=$1 ORDER BY created_at DESC,attempt_id DESC OFFSET 50)`,
      [a.userId],
    );
    await c.query('COMMIT');
  } catch {
    if (c) await c.query('ROLLBACK').catch(() => {}); /* Never expose database or provider text. */
  } finally {
    try {
      c?.release();
    } catch {
      /* Best-effort diagnostics only. */
    }
  }
}
