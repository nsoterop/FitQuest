import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const rules = read('.dockerignore')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith('#'));

test('every runtime asset COPY is admitted by the Docker context allowlist', () => {
  const copies = [...read('Dockerfile').matchAll(/^COPY --chown=node:node (\S+) (\S+)$/gm)];
  assert.ok(copies.length > 0);
  for (const [, source, destination] of copies) {
    assert.ok(statSync(new URL(source + '/', root)).isDirectory());
    assert.ok(
      rules.includes(`!${source}/`),
      `${source} directory is excluded from the Docker context`,
    );
    assert.ok(
      rules.includes(`!${source}/**`),
      `${source} contents are excluded from the Docker context`,
    );
    assert.equal(destination, `./${source}`);
  }
  assert.ok(copies.some(([, source]) => source === 'catalog'));
  assert.match(read('Dockerfile'), /^WORKDIR \/app$/m);
  assert.match(
    read('src/activityCatalog.ts'),
    /new URL\('\.\.\/catalog\/fitquest-v1\.json',\s*import\.meta\.url\)/,
  );
  const catalog = JSON.parse(read('catalog/fitquest-v1.json'));
  assert.equal(catalog.version, 'fitquest-2026-10-03-v1');
  assert.equal(catalog.activities.length, 255);
});

test('Docker context stays default-deny outside required build files and runtime assets', () => {
  assert.equal(rules[0], '*');
  // Keep this small allowlist explicit: broad exceptions could upload credentials,
  // local evaluation records, dependencies or unrelated files to the builder.
  const permitted = new Set([
    '!package.json',
    '!package-lock.json',
    '!tsconfig.json',
    '!src/',
    '!src/**',
    '!certs/',
    '!certs/**',
    '!catalog/',
    '!catalog/**',
  ]);
  for (const rule of rules.slice(1))
    assert.ok(permitted.has(rule), `Unexpected Docker context rule: ${rule}`);
  assert.equal(new Set(rules).size, rules.length);
});
