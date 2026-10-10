// Recorded responses from invented, metered evaluation cases; never owner content.
import { readFileSync } from 'node:fs';
import type { Usage } from '../../ai/onboardingProvider.js';
export const coachingRecords = JSON.parse(
  readFileSync(new URL('../../../fixtures/coaching-v1.json', import.meta.url), 'utf8'),
).results as {
  stage: string;
  input: any;
  raw: any;
  usage: Usage;
  accountedMicro: number;
  reservedMicro: number;
  failure?: string;
  rendered?: string;
}[];
