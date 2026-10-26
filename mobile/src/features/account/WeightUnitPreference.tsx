import * as SecureStore from 'expo-secure-store';
import { validPreferences } from '../../../../backend/src/shared/accountPreferences';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Text, View } from 'react-native';
import type {
  AccountPreferences,
  WeightUnit,
} from '../../../../backend/src/shared/accountPreferences';
import { Action, Notice, ui } from '../../components/Design';
import { preferencesRequest, PreferencesError } from './preferencesApi';
const Context = createContext({
  unit: 'lb' as WeightUnit,
  busy: false,
  error: '',
  reload: async () => {},
  setUnit: async (_unit: WeightUnit) => {},
});
export const useWeightUnits = () => useContext(Context);
export function WeightUnitsProvider({
  userId,
  accessToken,
  onSessionEnded,
  children,
}: {
  userId: string;
  accessToken: () => Promise<string>;
  onSessionEnded: () => void;
  children: ReactNode;
}) {
  const [saved, setSaved] = useState<AccountPreferences | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const current = useRef(saved),
    token = useRef(accessToken),
    ended = useRef(onSessionEnded),
    controller = useRef<AbortController | null>(null),
    live = useRef(true);
  token.current = accessToken;
  ended.current = onSessionEnded;
  async function run(unit?: WeightUnit) {
    if (controller.current) return;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError('');
    const timer = setTimeout(() => c.abort(), 30000);
    try {
      const t = await token.current();
      if (!live.current || c.signal.aborted) return;
      const change =
        unit && current.current
          ? { weightUnit: unit, expectedRevision: current.current.revision }
          : undefined;
      const next = await preferencesRequest(t, c.signal, change);
      if (live.current && !c.signal.aborted) {
        current.current = next;
        setSaved(next);
        await SecureStore.setItemAsync('weight-preferences.' + userId, JSON.stringify(next), {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      }
    } catch (e) {
      if (live.current) {
        if (!saved && current.current) setSaved(current.current);
        setError(e instanceof Error ? e.message : 'Could not sync weight units.');
        if (e instanceof PreferencesError && e.code === 'session_ended') ended.current();
      }
    } finally {
      clearTimeout(timer);
      if (controller.current === c) controller.current = null;
      if (live.current) setBusy(false);
    }
  }
  useEffect(() => {
    live.current = true;
    void (async () => {
      try {
        const raw = await SecureStore.getItemAsync('weight-preferences.' + userId);
        const cached: unknown = raw ? JSON.parse(raw) : null;
        if (live.current && !current.current && validPreferences(cached)) {
          current.current = cached;
          setSaved(cached);
        }
      } catch {
        /* A server read can recover an unavailable preference cache. */
      }
      if (live.current) {
        if (!current.current) {
          const defaults: AccountPreferences = { weightUnit: 'lb', revision: 0 };
          current.current = defaults;
          setSaved(defaults);
        }
        void run();
      }
    })();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void run();
    });
    return () => {
      live.current = false;
      controller.current?.abort();
      sub.remove();
    };
  }, []);
  return (
    <Context.Provider
      value={{
        unit: saved?.weightUnit ?? 'lb',
        busy,
        error,
        reload: () => run(),
        setUnit: (unit) => run(unit),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function WeightUnitSetting() {
  const { unit, busy, error, reload, setUnit } = useWeightUnits();
  useEffect(() => {
    void reload();
  }, []);
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={ui.section}>
        Weight units
      </Text>
      <Text style={ui.copy}>
        Used throughout FitQuest. Saved to your account and synced when your other devices
        reconnect. Existing records keep their original units.
      </Text>
      <View style={ui.row}>
        {(['lb', 'kg'] as const).map((u) => (
          <Action
            key={u}
            label={u === 'lb' ? 'Pounds (lbs)' : 'Kilograms (kg)'}
            secondary={u !== unit}
            selected={u === unit}
            disabled={busy}
            onPress={() => void setUnit(u)}
          />
        ))}
      </View>
      {!!error && (
        <>
          <Notice error>{error}</Notice>
          <Action label="Reload weight units" secondary busy={busy} onPress={() => void reload()} />
        </>
      )}
    </View>
  );
}
