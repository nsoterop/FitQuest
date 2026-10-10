import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';

test('production output excludes tests, fixtures and paid evaluation tooling', () => {
  const files = readdirSync(new URL('../backend/dist/', import.meta.url), { recursive: true });
  assert.ok(files.includes('server.js'));
  assert.ok(files.includes('shared/documentPlanContract.js'));
  assert.deepEqual(
    files.filter((f) => /\.test\.|Fixture|Evaluation|dist-test/.test(f)),
    [],
  );
});

test('mobile production code only imports platform-neutral shared backend contracts', () => {
  for (const file of readdirSync(new URL('../mobile/src/', import.meta.url))) {
    if (!/\.tsx?$/.test(file)) continue;
    const source = readFileSync(new URL('../mobile/src/' + file, import.meta.url), 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]*backend\/src\/[^'"]+)['"]/g))
      assert.ok(match[1].startsWith('../../backend/src/shared/'), `${file} imports server code`);
  }
  for (const file of readdirSync(new URL('../backend/src/shared/', import.meta.url))) {
    if (!file.endsWith('.ts')) continue;
    const source = readFileSync(new URL('../backend/src/shared/' + file, import.meta.url), 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g))
      assert.match(match[1], /^\.\/(?!\.\.)/, `${file} depends on server or native code`);
  }
});
