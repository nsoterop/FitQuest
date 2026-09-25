import { z } from 'zod';

const uuid = z.string().uuid();
const testEnvironment = z.string().regex(/^test_[a-z][a-z0-9-]{0,26}$/);

/** This descriptor names invented test data. It is never provider authority. */
export const SyntheticAccountStoreSchema = z.object({
  kind: z.literal('synthetic-account-test'),
  environment: testEnvironment,
  accountId: uuid,
  storeId: uuid,
  installInstanceId: uuid,
  localEpoch: z.number().int().safe().positive(),
}).strict();
export type SyntheticAccountStore = z.infer<typeof SyntheticAccountStoreSchema>;

export function syntheticAccountNamespace(value: SyntheticAccountStore) {
  const owner = SyntheticAccountStoreSchema.parse(value);
  const stem = `fitquest-m1c2-test-${owner.environment}-${owner.accountId}-${owner.storeId}-${owner.installInstanceId}`;
  return { database: `${stem}.db`, key: `${stem}.dbkey`, protected: `${stem}.authorization` };
}

export type FixtureId = 'A' | 'B';
export const fixtureAccountId = (id: FixtureId): string => id === 'A' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222';
export const fixtureStoreIdentity = (id: FixtureId) => {
  if (id !== 'A' && id !== 'B') throw new Error('Invalid fixture identity');
  return { environment: 'm1a.synthetic.v1', owner: id, database: `fitquest-m1a-synthetic-${id}.db`, key: `fitquest.m1a.fixture.${id}.dbkey`, serverAccountId: fixtureAccountId(id) } as const;
};
