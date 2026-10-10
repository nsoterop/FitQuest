import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function ignored(path) {
  const result = spawnSync('git', ['check-ignore','--no-index','--quiet',path], {cwd:root});
  assert.ok(result.status===0 || result.status===1, 'git ignore check failed');
  return result.status===0;
}
test('secrets, private records and generated files are ignored in every package', () => {
  for (const dir of ['', 'mobile/', 'backend/', 'nested/package/'])
    for (const name of ['.env','.env.production','.env.local','.env.production.local','.npmrc','credentials.json',
      'service-account-private.json','key.pem','signing.p12','private.key','data.sqlite','data.db-wal',
      '.ai-evaluation/private.json','.private-audit/report.json','pgdata/PG_VERSION','debug.log',
      'node_modules/pkg/a.js','.DS_Store']) assert.equal(ignored(dir+name),true,dir+name);
  assert.equal(ignored('docs/design/screen-mockups-2026-10-09/previews/exploration.png'),true);
});
test('placeholder examples, schema checkpoints, source and reviewed fixtures remain eligible', () => {
  for (const name of ['backend/.env.example','mobile/.env.example','backend/setup/manifest.json',
    'backend/src/planningFixture.ts','mobile/src/JournalScreen.tsx',
    'docs/design/screen-mockups-2026-10-09/v2/previews/profile.png']) assert.equal(ignored(name),false,name);
});
test('environment examples use placeholder endpoints and credentials', () => {
  for (const name of ['backend/.env.example','mobile/.env.example']) {
    const text = readFileSync(new URL('../'+name,import.meta.url),'utf8');
    assert.doesNotMatch(text,/sk-proj-|sb_secret_|onrender\.com|[a-z]{20}\.supabase\.co/);
    for (const line of text.split('\n').filter(line=>/^(?:EXPO_PUBLIC_)?(?:SUPABASE_PUBLISHABLE_KEY|OPENAI_API_KEY)=/.test(line)))
      assert.ok(line.endsWith('=') || line.endsWith('=sb_publishable_replace_me'));
  }
});
