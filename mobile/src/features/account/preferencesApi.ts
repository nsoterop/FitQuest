import {
  validPreferences,
  type AccountPreferences,
  type PreferencesChange,
} from '../../../../backend/src/shared/accountPreferences';
export class PreferencesError extends Error {
  code: string;
  constructor(code: string) {
    super(
      code === 'preferences_changed'
        ? 'Weight units changed on another device. Reload before choosing again.'
        : code === 'session_ended'
          ? 'Your session ended. Sign in again.'
          : 'Could not sync your weight units. Retry when connected.',
    );
    this.code = code;
  }
}
export async function preferencesRequest(
  token: string,
  signal: AbortSignal,
  change?: PreferencesChange,
): Promise<AccountPreferences> {
  try {
    const url = new URL(process.env.EXPO_PUBLIC_API_URL!);
    if (url.protocol !== 'https:' || url.username || url.password) throw Error();
    url.pathname = url.pathname.replace(/\/$/, '') + '/account-preferences';
    url.search = '';
    url.hash = '';
    const r = await fetch(url.toString(), {
      method: change ? 'PUT' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(change ? { 'Content-Type': 'application/json' } : {}),
      },
      signal,
      ...(change ? { body: JSON.stringify(change) } : {}),
    });
    if (signal.aborted) throw Error();
    if (r.status === 401) throw new PreferencesError('session_ended');
    if (r.status === 409) throw new PreferencesError('preferences_changed');
    if (r.status !== 200) throw Error();
    const v: unknown = await r.json();
    if (signal.aborted || !validPreferences(v)) throw Error();
    return v;
  } catch (e) {
    if (e instanceof PreferencesError) throw e;
    throw new PreferencesError('unavailable');
  }
}
