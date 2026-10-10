import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Exact reviewed upstream issues, not a severity-wide exclusion. Expiry forces a new review.
const exceptions = new Map([
  [
    'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
    { name: 'braces', range: '<=3.0.3', expires: '2026-11-09' },
  ],
  [
    'https://github.com/advisories/GHSA-86w9-cpqp-85rv',
    { name: 'node-forge', range: '<=1.4.0', expires: '2026-11-09' },
  ],
]);
export function auditReport(folder, report, now = new Date()) {
  if (!report?.metadata?.vulnerabilities || !report.vulnerabilities || report.error)
    throw new Error(`${folder}: dependency audit unavailable`);
  let failed = false;
  const messages = [];
  const roots = new Map();
  for (const finding of Object.values(report.vulnerabilities)) {
    for (const advisory of finding.via.filter((v) => v && typeof v === 'object'))
      roots.set(advisory.url, advisory);
    for (const dependency of finding.via.filter((v) => typeof v === 'string')) {
      if (!report.vulnerabilities[dependency]) {
        failed = true;
        messages.push(`${folder}: unresolved advisory dependency ${dependency}`);
      }
    }
  }
  for (const [url, advisory] of roots) {
    const exception = folder === 'mobile' ? exceptions.get(url) : undefined;
    const reviewed =
      exception &&
      exception.name === advisory.name &&
      exception.range === advisory.range &&
      now.toISOString().slice(0, 10) <= exception.expires;
    messages.push(
      `${folder}: ${reviewed ? 'reviewed unpatched exception' : 'ACTION REQUIRED'} ${advisory.name} ${url}`,
    );
    if (!reviewed) failed = true;
  }
  messages.push(
    `${folder}: ${report.metadata.vulnerabilities.total} affected dependency nodes, ${roots.size} root advisories`,
  );
  if (report.metadata.vulnerabilities.total > 0 && roots.size === 0) failed = true;
  return { failed, messages };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const folder of ['.', 'backend', 'mobile']) {
    const result = spawnSync('npm', ['audit', '--json'], { cwd: folder, encoding: 'utf8' });
    if (result.error || ![0, 1].includes(result.status))
      throw new Error(`${folder}: dependency audit unavailable`);
    const outcome = auditReport(folder, JSON.parse(result.stdout));
    for (const message of outcome.messages) console.log(message);
    if (outcome.failed) process.exitCode = 1;
  }
}
