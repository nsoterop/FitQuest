import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from './index';

describe('HealthResponseSchema', () => {
  it('accepts only the liveness contract', () => {
    expect(HealthResponseSchema.parse({ status: 'ok', service: 'fitquest-api', phase: 'scaffold' })).toEqual({
      status: 'ok', service: 'fitquest-api', phase: 'scaffold',
    });
  });

  it('rejects an invented readiness or coaching claim', () => {
    expect(HealthResponseSchema.safeParse({
      status: 'ok', service: 'fitquest-api', phase: 'scaffold', database: 'ready',
    }).success).toBe(false);
    expect(HealthResponseSchema.safeParse({
      status: 'ok', service: 'fitquest-api', phase: 'production',
    }).success).toBe(false);
  });
});
