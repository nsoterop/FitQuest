import assert from 'node:assert/strict';
import test from 'node:test';
import { auditReport } from './audit-dependencies.mjs';
const now = new Date('2026-10-10T12:00:00Z');
const advisory = {
  name: 'braces',
  url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
  range: '<=3.0.3',
};
const report = (value = advisory) => ({
  metadata: { vulnerabilities: { total: 2 } },
  vulnerabilities: { braces: { via: [value] }, tool: { via: ['braces'] } },
});
test('only exact reviewed mobile advisories pass within their review window', () => {
  assert.equal(auditReport('mobile', report(), now).failed, false);
  assert.equal(auditReport('backend', report(), now).failed, true);
  assert.equal(auditReport('mobile', report({ ...advisory, range: '<=3.0.4' }), now).failed, true);
  assert.equal(
    auditReport(
      'mobile',
      report({ ...advisory, url: 'https://github.com/advisories/GHSA-new-finding' }),
      now,
    ).failed,
    true,
  );
  assert.equal(auditReport('mobile', report(), new Date('2026-11-10T00:00:00Z')).failed, true);
});
test('unavailable or unresolved audit reports cannot masquerade as clean', () => {
  assert.throws(() => auditReport('mobile', { error: 'network' }, now));
  const opaque = report();
  opaque.vulnerabilities.braces.via = ['missing'];
  assert.equal(auditReport('mobile', opaque, now).failed, true);
  const clean = { metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} };
  assert.equal(auditReport('backend', clean, now).failed, false);
});
