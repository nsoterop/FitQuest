import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@fitquest-rebuild/contracts';
import { createApp } from './app';

describe('GET /health', () => {
  it('returns a validated scaffold-only liveness response', async () => {
    const app = createApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(response.json())).toEqual({
      status: 'ok', service: 'fitquest-api', phase: 'scaffold',
    });
    await app.close();
  });

  it('does not provide an accidental root endpoint', async () => {
    const app = createApp();
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
