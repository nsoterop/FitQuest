import * as SecureStore from 'expo-secure-store';

export type FixtureId = 'A' | 'B';
/** Local authorization is supplied by an identity provider adapter, never by a screen label. */
export interface AccountAccessBoundary<AccountId extends string = string> {
  assertLocalAccess(accountId: AccountId, generation: number): Promise<void>;
}
type AccessState = { version: 1; optIn: true; active: FixtureId | null; generation: number; revoked: FixtureId[]; expired: FixtureId[] };
const accessKey = 'fitquest.m1a.fixture.access';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

function parse(value: string | null): AccessState | null {
  if (value === null) return null;
  const data: unknown = JSON.parse(value);
  if (!data || typeof data !== 'object') throw new Error('Local authorization is corrupt');
  const state = data as AccessState;
  if (state.version !== 1 || state.optIn !== true || !['A', 'B', null].includes(state.active) || !Number.isSafeInteger(state.generation) || state.generation < 0 || !Array.isArray(state.revoked) || !Array.isArray(state.expired) || [...state.revoked, ...state.expired].some(x => x !== 'A' && x !== 'B')) throw new Error('Local authorization is corrupt');
  return state;
}

export async function readAccess(): Promise<AccessState | null> {
  if (!__DEV__) return null;
  return parse(await SecureStore.getItemAsync(accessKey));
}

async function write(state: AccessState): Promise<AccessState> {
  if (!__DEV__) throw new Error('Synthetic identities are unavailable in this build');
  await SecureStore.setItemAsync(accessKey, JSON.stringify(state), options);
  return state;
}

export async function optIn(): Promise<AccessState> {
  const previous = await readAccess();
  if (previous) return previous;
  return write({ version: 1, optIn: true, active: null, generation: 0, revoked: [], expired: [] });
}

export async function selectFixture(id: FixtureId): Promise<AccessState> {
  const previous = await readAccess();
  if (!previous?.optIn || previous.revoked.includes(id)) throw new Error('Synthetic identity is locked');
  return write({ ...previous, active: id, generation: previous.generation + 1 });
}

export async function lockFixture(revoke = false): Promise<AccessState> {
  const previous = await readAccess();
  if (!previous) throw new Error('No local authorization');
  return write({ ...previous, active: null, generation: previous.generation + 1, revoked: revoke && previous.active ? [...new Set([...previous.revoked, previous.active])] : previous.revoked });
}

export async function expireFixture(): Promise<AccessState> {
  const previous = await readAccess();
  if (!previous?.active) throw new Error('No active synthetic identity');
  return write({ ...previous, expired: [...new Set([...previous.expired, previous.active])] });
}

export async function assertAccess(id: FixtureId, generation: number): Promise<void> {
  const state = await readAccess();
  if (!state || state.active !== id || state.generation !== generation || state.revoked.includes(id)) throw new Error('Account access changed; old work was rejected');
}

export const fixtureAccessBoundary: AccountAccessBoundary<FixtureId> = { assertLocalAccess: assertAccess };

export function fixtureLabel(): string { return 'Local test identity · Synthetic data only · Sync not connected'; }
