import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';

test('production output excludes tests, fixtures and paid evaluation tooling', () => {
  const files = readdirSync(new URL('../backend/dist/', import.meta.url), { recursive: true });
  assert.ok(files.includes('server.js'));
  assert.ok(files.includes('shared/documentPlanContract.js'));
  assert.deepEqual(
    files.filter((f) => /\.test\.|Fixture|Evaluation|dist-test|^tests\/|^evaluation\//.test(f)),
    [],
  );
});

test('mobile production code only imports platform-neutral shared backend contracts', () => {
  const mobile = new URL('../mobile/src/', import.meta.url);
  const shared = new URL('../backend/src/shared/', import.meta.url);
  for (const file of readdirSync(mobile, { recursive: true })) {
    if (!/\.tsx?$/.test(file)) continue;
    const source = readFileSync(new URL(file, mobile), 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]*backend\/src\/[^'"]+)['"]/g))
      assert.ok(
        new URL(match[1], new URL(file, mobile)).href.startsWith(shared.href),
        `${file} imports server code`,
      );
  }
  for (const file of readdirSync(shared)) {
    if (!file.endsWith('.ts')) continue;
    const source = readFileSync(new URL(file, shared), 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g))
      assert.match(match[1], /^\.\/(?!\.\.)/, `${file} depends on server or native code`);
  }
});
