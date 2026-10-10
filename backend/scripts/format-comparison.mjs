// Diagnostic-only paired comparison. Never imported by the application.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, open, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool } from '../dist-test/profileStore.js';
import { configuredProvider } from '../dist-test/onboardingProvider.js';
import { postgresOnboardingStore } from '../dist-test/onboardingStore.js';
import { safeDiagnostic } from '../dist-test/providerDiagnostics.js';
import { prepareComplete, checkComplete } from '../dist-test/completePlanning.js';
import { weeklyLimits } from '../dist-test/weeklyPlanning.js';
export const formattingA =
  'Finally, format the complete plan using the provided response\nschema. Formatting must preserve the sessions and prescriptions,';
export const formattingB =
  'Finally, format the complete plan as readable text.\nFormatting must preserve the sessions and prescriptions,';
const sha = (s) => createHash('sha256').update(s).digest('hex');
export function preparePair(provider, input) {
  const A = prepareComplete(provider, input),
    a = JSON.parse(A.body),
    b = structuredClone(a);
  assert.equal(a.input.split(formattingA).length, 2);
  b.input = b.input.replace(formattingA, formattingB);
  delete b.text;
  const body = JSON.stringify(b);
  const B = {
    body,
    reserveMicro: provider.cost({
      input: Buffer.byteLength(body),
      output: weeklyLimits.outputTokens,
      cached: 0,
      cacheWrite: 0,
    }),
  };
  assert.equal(a.input.split('Exercise catalog:\n')[1], b.input.split('Exercise catalog:\n')[1]);
  const restored = structuredClone(b);
  restored.input = restored.input.replace(formattingB, formattingA);
  restored.text = a.text;
  assert.deepEqual(restored, a);
  assert.ok(
    A.reserveMicro + B.reserveMicro <= 100000,
    'Pair exceeds approved cumulative maximum reservations',
  );
  return {
    A,
    B,
    diff: {
      removedField: 'text.format (type=json_schema, name=complete_week, strict=true, full schema)',
      originalFormatting: formattingA,
      plainFormatting: formattingB,
      catalogSha256: sha(a.input.split('Exercise catalog:\n')[1]),
      settings: {
        model: a.model,
        store: a.store,
        stream: a.stream,
        truncation: a.truncation,
        service_tier: a.service_tier,
        reasoning: a.reasoning,
        max_output_tokens: a.max_output_tokens,
      },
      requests: {
        A: { bytes: Buffer.byteLength(A.body), sha256: sha(A.body), reservedMicro: A.reserveMicro },
        B: { bytes: Buffer.byteLength(B.body), sha256: sha(B.body), reservedMicro: B.reserveMicro },
      },
      maximumReservedMicro: A.reserveMicro + B.reserveMicro,
    },
  };
}
// Same weekly byte/token/time bounds for either format, independent of format.name.
// Raw outputs are retained only by this private diagnostic harness.
export async function callWeekly(body, key, signal, fetcher = fetch) {
  const request = JSON.parse(body);
  assert.equal(request.model, 'gpt-6-luna');
  assert.equal(request.max_output_tokens, weeklyLimits.outputTokens);
  assert.ok(Buffer.byteLength(body) <= weeklyLimits.inputBytes);
  assert.deepEqual(request.reasoning, { effort: 'low' });
  assert.equal(request.service_tier, 'default');
  assert.equal(request.store, false);
  assert.equal(request.stream, false);
  assert.equal(request.truncation, 'disabled');
  let diagnostic = {},
    rawResponse = '',
    rawText = '';
  try {
    const response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body,
    });
    diagnostic = safeDiagnostic({
      httpStatus: response.status,
      requestId: response.headers.get('x-request-id') ?? undefined,
    });
    if (!response.body) return { failure: 'provider_error', diagnostic, rawResponse, rawText };
    const reader = response.body.getReader(),
      chunks = [];
    let bytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > (response.ok ? weeklyLimits.responseBytes : 8192)) {
        await reader.cancel();
        return {
          failure: 'provider_error',
          diagnostic: { ...diagnostic, transport: 'response_limit' },
          rawResponse: Buffer.concat(chunks).toString('utf8'),
          rawText,
        };
      }
      chunks.push(part.value);
    }
    rawResponse = Buffer.concat(chunks).toString('utf8');
    const data = JSON.parse(rawResponse);
    if (!response.ok)
      return {
        failure: 'provider_error',
        diagnostic: safeDiagnostic({ ...diagnostic, code: data.error?.code ?? data.error?.type }),
        rawResponse,
        rawText,
      };
    const u = data.usage,
      n = [
        u?.input_tokens,
        u?.output_tokens,
        u?.input_tokens_details?.cached_tokens ?? 0,
        u?.input_tokens_details?.cache_write_tokens ?? 0,
      ];
    const usage =
      n.every((v) => Number.isSafeInteger(v) && v >= 0) &&
      n[0] <= Buffer.byteLength(body) &&
      n[1] <= weeklyLimits.outputTokens &&
      n[2] + n[3] <= n[0]
        ? { input: n[0], output: n[1], cached: n[2], cacheWrite: n[3] }
        : undefined;
    const content = (Array.isArray(data.output) ? data.output : [])
      .filter((x) => x.type === 'message')
      .flatMap((x) => x.content ?? []);
    rawText = content
      .flatMap((x) =>
        x.type === 'output_text' && typeof x.text === 'string'
          ? [x.text]
          : x.type === 'refusal' && typeof x.refusal === 'string'
            ? [x.refusal]
            : [],
      )
      .join('\n');
    const base = {
      diagnostic,
      usage,
      rawResponse,
      rawText,
      responseId: typeof data.id === 'string' ? data.id : undefined,
    };
    if (data.status !== 'completed') return { ...base, failure: 'incomplete' };
    if (content.some((x) => x.type === 'refusal')) return { ...base, failure: 'refused' };
    const texts = content.filter((x) => x.type === 'output_text');
    if (texts.length !== 1 || typeof texts[0].text !== 'string')
      return { ...base, failure: 'incomplete' };
    if (request.text?.format) {
      try {
        return { ...base, proposal: JSON.parse(texts[0].text) };
      } catch {
        return { ...base, failure: 'invalid_json' };
      }
    }
    return base;
  } catch {
    return {
      failure: 'provider_error',
      diagnostic: {
        ...diagnostic,
        transport: signal.aborted
          ? 'aborted'
          : diagnostic.httpStatus
            ? 'invalid_response'
            : 'network',
      },
      rawResponse,
      rawText,
    };
  }
}
export async function runVariant({
  prepared,
  key,
  attempt,
  provider,
  settle,
  save,
  validate,
  fetcher,
}) {
  const start = performance.now();
  const result = await callWeekly(
    prepared.body,
    key,
    AbortSignal.timeout(weeklyLimits.timeoutMs),
    fetcher,
  );
  const cost = result.usage ? provider.cost(result.usage) : null;
  let saveError;
  try {
    await save(result);
  } catch (e) {
    saveError = e;
  }
  await settle(attempt, cost, result.diagnostic);
  if (saveError) throw saveError;
  let validation;
  if (validate && !result.failure) {
    try {
      const checked = validate(result.proposal);
      validation = { valid: true, kind: checked.result.kind };
    } catch (e) {
      validation = {
        valid: false,
        code: e.code ?? 'invalid_model_output',
        diagnostic: e.diagnostic,
      };
    }
  }
  return {
    attempt,
    latencyMs: Math.round(performance.now() - start),
    reservedMicro: prepared.reserveMicro,
    accountedMicro: cost,
    usage: result.usage,
    failure: result.failure,
    diagnostic: result.diagnostic,
    responseId: result.responseId,
    validation,
  };
}
async function main() {
  const mode = process.argv[2];
  assert.ok(['prepare', 'run'].includes(mode));
  const dir = new URL('../.ai-evaluation/', import.meta.url);
  await chmod(dir, 0o700);
  const baseline = JSON.parse(await readFile(new URL('owner-baseline-v1.json', dir), 'utf8'));
  assert.equal(baseline.answersSha256, sha(JSON.stringify(baseline.answers)));
  assert.deepEqual(
    baseline.source.summary.map((x) => x.text),
    baseline.answers,
  );
  const provider = configuredProvider({ ...process.env, ONBOARDING_AI_ENABLED: 'true' });
  assert.ok(provider);
  assert.equal(provider.capMicro, 7000000);
  const rates = [
    'OPENAI_INPUT_USD_PER_M',
    'OPENAI_CACHED_USD_PER_M',
    'OPENAI_CACHE_WRITE_USD_PER_M',
    'OPENAI_OUTPUT_USD_PER_M',
  ].map((k) => Number(process.env[k]));
  assert.deepEqual(rates, [0.1, 0.01, 0.125, 0.5]);
  const input = {
    kind: 'week',
    schemaVersion: 'complete-week-v1',
    summary: baseline.source.summary,
    dates: baseline.source.dates,
  };
  const pair = preparePair(provider, input);
  const save = async (name, value) =>
    writeFile(
      new URL(name, dir),
      typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
  if (mode === 'prepare') {
    await save('format-pair-A-request.json', pair.A.body);
    await save('format-pair-B-request.json', pair.B.body);
    await save('format-pair-request-diff.json', pair.diff);
    console.log(JSON.stringify(pair.diff));
    return;
  }
  assert.equal(process.env.FITQUEST_FORMAT_PAIR_APPROVED, 'true');
  for (const name of ['A', 'B'])
    assert.equal(
      await readFile(new URL(`format-pair-${name}-request.json`, dir), 'utf8'),
      pair[name].body,
    );
  const connection = new URL(process.env.DATABASE_URL);
  assert.equal(connection.username, 'fitquest_app.wqvxddvihlobnalxpzow');
  assert.equal(connection.searchParams.get('sslmode'), 'verify-full');
  assert.ok(connection.hostname.endsWith('.supabase.com'));
  const lock = await open(new URL('format-pair-v1.started', dir), 'wx', 0o600);
  await lock.close(); // Permanent no-rerun marker, including interrupted runs.
  const pool = createPool(connection.toString()),
    account = {
      userId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      sessionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    },
    attempts = { A: randomUUID(), B: randomUUID() };
  try {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('fitquest.user_id',$1,true)", [account.userId]);
      await c.query('SELECT pg_advisory_xact_lock(71629101)');
      assert.equal(
        Number(
          (
            await c.query(
              "SELECT count(*) FROM fitquest.onboarding_attempts WHERE user_id=$1 AND prompt_version LIKE 'format-pair-v1-%'",
              [account.userId],
            )
          ).rows[0].count,
        ),
        0,
        'Pair already attempted',
      );
      for (const name of ['A', 'B']) {
        await c.query(
          "INSERT INTO fitquest.onboarding_attempts(user_id,id,purpose,state,model,prompt_version,schema_version) VALUES($1,$2,'evaluation','not_dispatched',$3,$4,'complete-week-v1')",
          [account.userId, attempts[name], provider.model, `format-pair-v1-${name}`],
        );
        assert.equal(
          (
            await c.query('SELECT fitquest.reserve_onboarding($1,$2,$3) AS allowed', [
              attempts[name],
              pair[name].reserveMicro,
              provider.capMicro,
            ])
          ).rows[0].allowed,
          true,
          'Pair cannot fit current durable headroom',
        );
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    await save('format-pair-reservations.json', {
      attempts,
      maximumReservedMicro: pair.diff.maximumReservedMicro,
      at: new Date().toISOString(),
    });
    const store = postgresOnboardingStore(pool);
    for (const name of ['A', 'B']) {
      const result = await runVariant({
        prepared: pair[name],
        key: process.env.OPENAI_API_KEY,
        attempt: attempts[name],
        provider,
        settle: (id, cost, diagnostic) => store.settle(account, id, cost, diagnostic),
        save: async (raw) => {
          await save(`format-pair-${name}-raw.json`, raw);
          await save(`format-pair-${name}-output.txt`, raw.rawText);
        },
        validate: name === 'A' ? (v) => checkComplete(v, input) : undefined,
      });
      await save(`format-pair-${name}-result.json`, { variant: name, ...result });
      console.log(JSON.stringify({ variant: name, ...result }));
    }
  } finally {
    await pool.end();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
