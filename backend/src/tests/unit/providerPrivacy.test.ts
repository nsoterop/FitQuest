import assert from 'node:assert/strict';
import test from 'node:test';
import { openAIProvider } from '../../ai/onboardingProvider.js';
import { prepareDocument } from '../../features/planning/documentPlanning.js';
import { intakeSummary } from '../../features/onboarding/fixedIntake.js';
import { weeklyLimits } from '../../features/planning/weeklyPlanning.js';

const marker = 'InventedPrivateProviderBodyMarker';
const config = {
  key: 'synthetic-provider-key',
  model: 'gpt-6.1-sol',
  capMicro: 7000000,
  inputRate: 2,
  cachedRate: 0.1,
  cacheWriteRate: 2.5,
  outputRate: 10,
};
const input = {
  kind: 'week' as const,
  dates: Array.from({ length: 7 }, (_, i) => `2026-10-${12 + i}`),
  schemaVersion: 'document-week-v4' as const,
  summary: intakeSummary({
    version: 1,
    answers: ['Strength', 'Dance', 'Bands', 'Flexible sessions', 'None'],
  }),
  profile: { age: 30, heightInches: 68, weightLb: 155, gender: 'Not specified' },
};
test('provider HTTP errors retain only bounded reason codes and sanitized correlation identifiers', async () => {
  for (const code of ['rate_limit_exceeded', marker]) {
    let calls = 0;
    const provider = openAIProvider(config, async () => {
      calls++;
      return new Response(
        JSON.stringify({
          error: { code, message: marker, prompt: marker, headers: { authorization: marker } },
        }),
        { status: 429, headers: { 'x-request-id': 'req_synthetic_security' } },
      );
    });
    const result = await provider.call(
      prepareDocument(provider, input).body,
      new AbortController().signal,
    );
    assert.equal(calls, 1);
    assert.deepEqual(result, {
      failure: 'provider_error',
      diagnostic: {
        httpStatus: 429,
        requestId: 'req_synthetic_security',
        ...(code === marker ? {} : { code }),
      },
    });
    assert(!JSON.stringify(result).includes(marker));
  }
});
test('refusal prose, incomplete output and attacker-controlled request IDs are never diagnostics or saved proposals', async () => {
  for (const failure of ['refused', 'incomplete'] as const) {
    let calls = 0;
    const provider = openAIProvider(config, async () => {
      calls++;
      return new Response(
        JSON.stringify({
          status: failure === 'incomplete' ? 'incomplete' : 'completed',
          usage: { input_tokens: 100, output_tokens: 20 },
          output: [{ type: 'message', content: [{ type: 'refusal', refusal: marker }] }],
          private: marker,
        }),
        { headers: { 'x-request-id': `https://example.invalid/${marker}` } },
      );
    });
    const result = await provider.call(
      prepareDocument(provider, input).body,
      new AbortController().signal,
    );
    assert.equal(calls, 1);
    assert.deepEqual(result, {
      failure,
      usage: { input: 100, output: 20, cached: 0, cacheWrite: 0 },
      diagnostic: { httpStatus: 200 },
    });
    assert(!JSON.stringify(result).includes(marker));
  }
});
test('provider-reported tool calls and extra metadata cannot become app actions or returned diagnostics', async () => {
  let calls = 0;
  const proposal = { version: 1, result: { kind: 'unavailable', reason: 'out_of_scope' } };
  const provider = openAIProvider(config, async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const request = JSON.parse(String(options!.body));
    assert(!('tools' in request));
    return new Response(
      JSON.stringify({
        status: 'completed',
        usage: { input_tokens: 100, output_tokens: 20 },
        output: [
          { type: 'function_call', name: 'erase_account', arguments: marker },
          { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(proposal) }] },
        ],
        metadata: { private: marker },
      }),
    );
  });
  const result = await provider.call(
    prepareDocument(provider, input).body,
    new AbortController().signal,
  );
  assert.equal(calls, 1);
  assert.deepEqual(result, {
    proposal,
    usage: { input: 100, output: 20, cached: 0, cacheWrite: 0 },
    diagnostic: { httpStatus: 200 },
  });
  assert(!JSON.stringify(result).includes(marker));
});
test('oversized provider responses are canceled once without exposing body text or retrying', async () => {
  for (const status of [200, 400]) {
    let calls = 0,
      canceled = 0;
    const limit = status === 200 ? weeklyLimits.responseBytes : 8192;
    const provider = openAIProvider(config, async () => {
      calls++;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(marker + 'x'.repeat(limit)));
          },
          cancel() {
            canceled++;
          },
        }),
        { status, headers: { 'x-request-id': 'req_synthetic_limit' } },
      );
    });
    const result = await provider.call(
      prepareDocument(provider, input).body,
      new AbortController().signal,
    );
    assert.equal(calls, 1);
    assert.equal(canceled, 1);
    assert.equal(result.failure, 'provider_error');
    assert.deepEqual(result.diagnostic, {
      httpStatus: status,
      requestId: 'req_synthetic_limit',
      ...(status === 200 ? { transport: 'response_limit' } : {}),
    });
    assert(!JSON.stringify(result).includes(marker));
  }
});
