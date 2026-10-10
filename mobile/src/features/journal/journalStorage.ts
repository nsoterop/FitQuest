import * as SecureStore from 'expo-secure-store';
import { secureSessionStorage } from '../account/secureSessionStorage';
import { journalDrafts } from './journalDraft';
export const privateJournalDrafts = journalDrafts(
  secureSessionStorage(
    {
      getItemAsync: (k) => SecureStore.getItemAsync(k),
      setItemAsync: (k, v) =>
        SecureStore.setItemAsync(k, v, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
      deleteItemAsync: (k) => SecureStore.deleteItemAsync(k),
    },
    500000,
  ),
);
