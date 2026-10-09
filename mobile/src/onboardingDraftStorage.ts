import * as SecureStore from 'expo-secure-store';
import { secureSessionStorage } from './secureSessionStorage';
import {foodDrafts} from './foodDraft';
import { onboardingDrafts } from './onboardingDraft';
const storage=secureSessionStorage({
  getItemAsync:k=>SecureStore.getItemAsync(k),
  setItemAsync:(k,v)=>SecureStore.setItemAsync(k,v,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}),
  deleteItemAsync:k=>SecureStore.deleteItemAsync(k),
});
export const privateFoodDrafts=foodDrafts(storage);
const intake=onboardingDrafts(storage);
export const privateDrafts={...intake,clear:async(userId:string,conversationId?:string)=>{await intake.clear(userId,conversationId);if(conversationId===undefined)await privateFoodDrafts.clear(userId)}};
