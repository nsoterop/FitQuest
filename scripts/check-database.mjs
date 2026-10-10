import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

// This command owns only the cluster it creates; an occupied test port is a hard stop.
const occupied = await new Promise((resolve) => {
  const socket = net.connect(55432, '127.0.0.1');
  socket.once('connect', () => {
    socket.destroy();
    resolve(true);
  });
  socket.once('error', () => resolve(false));
});
if (occupied)
  throw new Error(
    'Port 55432 is occupied. Leave that server alone and retry after its owner stops it.',
  );
const configured = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
const bin = process.env.FITQUEST_PG_BIN ?? configured.stdout?.trim();
if (!bin) throw new Error('Install PostgreSQL server/client tools or set FITQUEST_PG_BIN.');
const root = mkdtempSync(path.join(tmpdir(), 'fitquest-check-'));
const data = path.join(root, 'data');
const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
function pg(command, args) {
  const result = spawnSync(path.join(bin, command), args, { env, encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr || result.error?.message}`);
}
let started = false;
let child;
let interrupted = false;
const interrupt = () => {
  interrupted = true;
  child?.kill('SIGTERM');
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  pg('initdb', ['-D', data, '-U', 'fitquest_test', '-A', 'trust', '--no-locale']);
  pg('pg_ctl', [
    '-D',
    data,
    '-l',
    path.join(root, 'postgres.log'),
    '-o',
    `-h 127.0.0.1 -p 55432 -k ${root}`,
    '-w',
    'start',
  ]);
  started = true;
  if (interrupted) throw new Error('Verification interrupted');
  child = spawn('npm', ['test', '--prefix', 'backend'], {
    stdio: 'inherit',
    env: {
      ...env,
      FITQUEST_TEST_DATABASE_URL: 'postgresql://fitquest_test@127.0.0.1:55432/postgres',
    },
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  if (started || existsSync(path.join(data, 'postmaster.pid'))) {
    pg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    console.log('Temporary PostgreSQL cluster stopped.');
  }
  rmSync(root, { recursive: true, force: true });
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
