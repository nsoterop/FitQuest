import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

// A frozen, reviewed install checkpoint. Future upgrades use forward migrations.
export async function installFresh(client) {
  const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
  const scripts = await Promise.all(manifest.map(async entry => {
    const sql = await readFile(new URL('../supabase/migrations/' + entry.file, import.meta.url), 'utf8');
    if (createHash('sha256').update(sql).digest('hex') !== entry.sha256) throw new Error('Installation checkpoint changed');
    return sql;
  }));
  scripts[0] = await readFile(new URL('./profiles.sql', import.meta.url), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'");
    await client.query('SELECT pg_advisory_xact_lock(71629102)');
    const existing = await client.query("SELECT 1 FROM pg_namespace WHERE nspname='fitquest'");
    if (existing.rowCount) throw new Error('Fresh installation requires no existing FitQuest schema');
    // Require managed prerequisites; never reset Auth, Storage or a migration ledger.
    await client.query('SELECT id FROM auth.users LIMIT 0');
    await client.query('SELECT id,user_id,not_after FROM auth.sessions LIMIT 0');
    const versions = manifest.map(entry => entry.file.split('_')[0]);
    await client.query('LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE');
    const ledger = await client.query('SELECT version FROM supabase_migrations.schema_migrations WHERE version=ANY($1::text[])', [versions]);
    if (ledger.rowCount) throw new Error('Installation checkpoint already recorded; reconcile existing migrations instead');
    for (let i = 0; i < scripts.length; i++) {
      await client.query(scripts[i]);
      // The first version is satisfied by the safe equivalent schema, NOT by running its reset.
      await client.query('INSERT INTO supabase_migrations.schema_migrations(version) VALUES($1)', [versions[i]]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== '--fresh' || !process.env.FITQUEST_SETUP_DATABASE_URL) {
    console.error('Usage: set FITQUEST_SETUP_DATABASE_URL securely, then node setup/install.mjs --fresh');
    process.exitCode = 1;
  } else {
    const client = new pg.Client({ connectionString: process.env.FITQUEST_SETUP_DATABASE_URL });
    try {
      await client.connect();
      await installFresh(client);
      console.log('Fresh schema installed. The initial ledger remains disabled; credentials were not provisioned.');
    } catch {
      // Driver errors can contain connection strings or private row values.
      console.error('Installation not confirmed. Inspect schema and checkpoint privately before retrying; no reset is attempted.');
      process.exitCode = 1;
    } finally {
      await client.end();
    }
  }
}
