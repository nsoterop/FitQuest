import * as SecureStore from 'expo-secure-store';
import { secureSessionStorage } from './secureSessionStorage';
import type { WeightCommand, WeightMeasurement } from '../../backend/src/shared/weightContract';
export type WeightDraft = {
  value: string;
  unit: WeightMeasurement['unit'];
  date: string;
  timeZone: string;
  entryId: string | null;
  revision: number | null;
  pending: WeightCommand | null;
};
const storage = secureSessionStorage({
  getItemAsync: (k) => SecureStore.getItemAsync(k),
  setItemAsync: (k, v) =>
    SecureStore.setItemAsync(k, v, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  deleteItemAsync: (k) => SecureStore.deleteItemAsync(k),
});
// Deliberately separate from onboarding/sign-out cleanup. No expiry.
export const privateWeightDrafts = {
  async read(userId: string): Promise<WeightDraft | null> {
    const raw = await storage.getItem('body-weight.' + userId);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d === null) return null;
    if (
      typeof d.value !== 'string' ||
      typeof d.date !== 'string' ||
      !['lb', 'kg'].includes(d.unit) ||
      typeof d.timeZone !== 'string'
    )
      throw Error('Unreadable weight draft');
    return d;
  },
  write: (userId: string, d: WeightDraft | null) =>
    storage.setItem('body-weight.' + userId, JSON.stringify(d)),
};
