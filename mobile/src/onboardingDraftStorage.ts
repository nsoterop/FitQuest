import * as SecureStore from 'expo-secure-store';
import { secureSessionStorage } from './secureSessionStorage';
import { onboardingDrafts } from './onboardingDraft';
export const privateDrafts=onboardingDrafts(secureSessionStorage({
  getItemAsync:k=>SecureStore.getItemAsync(k),
  setItemAsync:(k,v)=>SecureStore.setItemAsync(k,v,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}),
  deleteItemAsync:k=>SecureStore.deleteItemAsync(k),
}));
