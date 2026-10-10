import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Action, Notice, ui } from '../../components/Design';
import { JournalField } from '../journal/JournalScreen';
import { operationId } from '../onboarding/onboardingApi';
import { privateWeightDrafts, type WeightDraft } from './weightStorage';
import { weightRequest, WeightError } from './weightApi';
import {
  validWeightMeasurement,
  weightToday,
  type WeightEntry,
  type WeightList,
  type WeightReceipt,
  type WeightCommand,
} from '../../../../backend/src/shared/weightContract';
type Props = { userId: string; accessToken: () => Promise<string>; onSessionEnded?: () => void };
const description = (e: WeightEntry) =>
  e.measurement
    ? `${e.measurement.value} ${e.measurement.unit} · ${e.measurement.date}`
    : 'Measurement deleted';
export function BodyWeight(props: Props) {
  return <WeightAccount key={props.userId} {...props} />;
}
function WeightAccount({ userId, accessToken, onSessionEnded }: Props) {
  const [list, setList] = useState<WeightList>({ items: [], nextOffset: null }),
    [loaded, setLoaded] = useState(false),
    [ready, setReady] = useState(false),
    [history, setHistory] = useState(false),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<WeightDraft | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [confirm, setConfirm] = useState(false),
    [conflict, setConflict] = useState<WeightEntry | null>(null),
    [restoreFailed, setRestoreFailed] = useState(false);
  const current = useRef<WeightDraft | null>(null),
    live = useRef(true),
    controller = useRef<AbortController | null>(null),
    token = useRef(accessToken),
    ended = useRef(onSessionEnded),
    writeVersion = useRef(0);
  token.current = accessToken;
  ended.current = onSessionEnded;
  const paint = (d: WeightDraft | null) => {
    current.current = d;
    if (live.current) setDraft(d);
  };
  async function persist(d: WeightDraft | null) {
    const version = ++writeVersion.current;
    await privateWeightDrafts.write(userId, d);
    if (live.current && version === writeVersion.current)
      setNotice(d?.pending ? 'Waiting to sync' : d ? 'Saved on this device' : '');
  }
  function change(d: WeightDraft) {
    if (controller.current || current.current?.pending) return;
    paint(d);
    setNotice('Saving on this device…');
    void persist(d).catch(() => {
      if (live.current)
        setError('Could not save this device draft. Keep this screen open and retry saving.');
    });
  }
  async function restore() {
    try {
      const d = await privateWeightDrafts.read(userId);
      if (!live.current) return;
      paint(d);
      setReady(true);
      setRestoreFailed(false);
      if (d) setNotice(d.pending ? 'Waiting to sync' : 'Saved on this device');
    } catch {
      if (live.current) {
        setRestoreFailed(true);
        setError('Could not restore your weight draft. It has not been removed.');
      }
    }
  }
  useEffect(() => {
    live.current = true;
    void restore();
    void reload();
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, [userId]);
  async function run(
    fn: (
      request: <T extends WeightEntry | WeightList | WeightReceipt>(
        path: string,
        cmd?: WeightCommand,
      ) => Promise<T>,
    ) => Promise<void>,
  ) {
    if (controller.current) return;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    const timer = setTimeout(() => c.abort(), 30000);
    try {
      const t = await token.current();
      if (!live.current || c.signal.aborted) return;
      await fn(
        async <T extends WeightEntry | WeightList | WeightReceipt>(
          path: string,
          cmd?: WeightCommand,
        ) => {
          const v = await weightRequest<T>(path, t, c.signal, cmd);
          if (!live.current || c.signal.aborted) throw Error();
          return v;
        },
      );
    } catch (e) {
      if (live.current) {
        setError(
          e instanceof WeightError
            ? e.message
            : 'Could not confirm the result. Your weight draft is kept.',
        );
        if (e instanceof WeightError && e.code === 'session_ended') ended.current?.();
      }
    } finally {
      clearTimeout(timer);
      if (controller.current === c) controller.current = null;
      if (live.current) setBusy(false);
    }
  }
  async function reload(more = false) {
    await run(async (request) => {
      const next = await request<WeightList>(more ? '?offset=' + list.nextOffset : '');
      setList(more ? { items: [...list.items, ...next.items], nextOffset: next.nextOffset } : next);
      setLoaded(true);
    });
  }
  function start(e?: WeightEntry) {
    setError('');
    setConfirm(false);
    setConflict(null);
    setEditing(true);
    if (current.current) return;
    const m = e?.measurement,
      timeZone = m?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    change({
      value: m ? String(m.value) : '',
      unit: m?.unit ?? 'lb',
      date: m?.date ?? weightToday(timeZone),
      timeZone,
      entryId: e?.id ?? null,
      revision: e?.revision ?? null,
      pending: null,
    });
  }
  async function submit(cmd?: WeightCommand) {
    const d = current.current;
    if (!d || controller.current) return;
    const command = d.pending ?? cmd;
    if (!command) return;
    const next = { ...d, pending: command };
    paint(next);
    setError('');
    await run(async (request) => {
      // Durable operation identity precedes dispatch; retries never invent another mutation.
      await persist(next);
      try {
        await request<WeightReceipt>('/commands', command);
      } catch (e) {
        if (e instanceof WeightError && e.code === 'weight_changed' && command.entryId) {
          setConflict(await request<WeightEntry>('/' + command.entryId));
        }
        if (
          e instanceof WeightError &&
          ['invalid_request', 'future_weight', 'weight_missing'].includes(e.code)
        ) {
          const editable = { ...next, pending: null };
          await persist(editable);
          paint(editable);
        }
        throw e;
      }
      await persist(null);
      paint(null);
      setEditing(false);
      setConfirm(false);
      setConflict(null);
      setNotice(
        command.kind === 'delete' ? 'Weight measurement deleted.' : 'Weight measurement saved.',
      );
      const saved = await request<WeightList>('');
      setList(saved);
      setLoaded(true);
    });
  }
  async function save() {
    const d = current.current;
    if (!d || d.pending) return;
    const measurement = {
      value: Number(d.value),
      unit: d.unit,
      date: d.date,
      timeZone: d.timeZone,
    };
    if (!/^\d+(\.\d+)?$/.test(d.value.trim()) || !validWeightMeasurement(measurement)) {
      setError(
        'Enter a valid date and a weight greater than zero, up to 10,000 in the selected unit.',
      );
      return;
    }
    await submit({
      operationId: operationId(),
      kind: 'save',
      entryId: d.entryId,
      expectedRevision: d.revision,
      measurement,
    });
  }
  async function keepEdits() {
    if (!conflict || !current.current) return;
    const next = {
      ...current.current,
      entryId: conflict.deletedAt ? null : conflict.id,
      revision: conflict.deletedAt ? null : conflict.revision,
      pending: null,
    };
    try {
      await persist(next);
      paint(next);
      setConflict(null);
      setConfirm(false);
      setError('Review your retained values, then save explicitly.');
    } catch {
      setError('Could not save this device draft. Your pending request is retained.');
    }
  }
  async function discard() {
    if (current.current?.pending || controller.current) return;
    try {
      await persist(null);
      paint(null);
      setEditing(false);
      setConfirm(false);
      setError('');
    } catch {
      setError('Could not discard this device draft. Retry when storage is available.');
    }
  }
  const blocked = busy || !!draft?.pending,
    latest = list.items[0];
  return (
    <View style={{ gap: 10, paddingVertical: 16 }}>
      <Text accessibilityRole="header" style={ui.section}>
        Body weight
      </Text>
      <Text style={ui.copy}>
        {latest
          ? `Latest measurement: ${description(latest)}`
          : loaded
            ? 'No weight measurements yet.'
            : 'Loading weight…'}
      </Text>
      {!!error && <Notice error>{error}</Notice>}
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={ui.copy}>
          {notice}
        </Text>
      )}
      {restoreFailed && (
        <Action label="Retry weight draft recovery" secondary onPress={() => void restore()} />
      )}
      {!editing && (
        <View style={ui.row}>
          <Action
            label={draft ? 'Resume weight draft' : 'Log weight'}
            secondary
            disabled={!ready || busy}
            onPress={() => start()}
          />
          <Action
            label={history ? 'Hide weight history' : 'Weight history'}
            secondary
            onPress={() => setHistory((v) => !v)}
          />
        </View>
      )}
      {editing && draft && (
        <>
          <JournalField
            label={`Body weight (${draft.unit})`}
            value={draft.value}
            numeric
            disabled={blocked}
            onChange={(value) => change({ ...draft, value })}
          />
          <View style={ui.row}>
            {(['lb', 'kg'] as const).map((unit) => (
              <Action
                key={unit}
                label={unit === 'lb' ? 'Pounds (lb)' : 'Kilograms (kg)'}
                secondary={unit !== draft.unit}
                disabled={blocked}
                onPress={() => change({ ...draft, unit })}
              />
            ))}
          </View>
          <Text style={ui.copy}>
            Enter your scale’s reading in the selected unit. Changing units does not convert the
            number.
          </Text>
          <JournalField
            label="Measurement date (YYYY-MM-DD)"
            value={draft.date}
            disabled={blocked}
            onChange={(date) => change({ ...draft, date })}
          />
          <Text style={ui.copy}>
            Saved privately. This does not change your profile weight or accepted plan targets.
          </Text>
          {draft.pending ? (
            <Action label="Retry saved weight request" busy={busy} onPress={() => void submit()} />
          ) : (
            <Action
              label={draft.entryId ? 'Save weight correction' : 'Save weight'}
              busy={busy}
              onPress={() => void save()}
            />
          )}
          {conflict && (
            <>
              <Notice title="Current saved measurement">{description(conflict)}</Notice>
              <Action
                label={
                  conflict.deletedAt
                    ? 'Keep my values as a new measurement'
                    : 'Keep my weight edits on this version'
                }
                secondary
                disabled={busy}
                onPress={() => void keepEdits()}
              />
            </>
          )}
          {draft.entryId && !draft.pending && (
            <Action
              label="Delete weight measurement"
              secondary
              disabled={busy}
              onPress={() => setConfirm(true)}
            />
          )}
          {confirm && !draft.pending && (
            <>
              <Notice>
                Delete this dated measurement? This cannot be undone. Your other measurements stay
                saved.
              </Notice>
              <Action
                label="Confirm delete weight"
                disabled={busy}
                onPress={() =>
                  void submit({
                    operationId: operationId(),
                    kind: 'delete',
                    entryId: draft.entryId!,
                    expectedRevision: draft.revision!,
                  })
                }
              />
              <Action
                label="Keep weight measurement"
                secondary
                disabled={busy}
                onPress={() => setConfirm(false)}
              />
            </>
          )}
          <Action
            label="Close weight editor"
            secondary
            disabled={busy}
            onPress={() => {
              setEditing(false);
              setConfirm(false);
            }}
          />
          {!draft.pending && (
            <Action
              label="Discard weight draft"
              secondary
              disabled={busy}
              onPress={() => void discard()}
            />
          )}
        </>
      )}
      {history && !editing && (
        <>
          {list.items.map((e) => (
            <View key={e.id} style={{ gap: 5 }}>
              <Text style={ui.copy}>{description(e)}</Text>
              <Action
                label={`Edit weight ${e.measurement!.date} · ${e.measurement!.value} ${e.measurement!.unit}`}
                secondary
                disabled={busy || !!draft || !ready}
                onPress={() => start(e)}
              />
            </View>
          ))}
          {list.nextOffset !== null && (
            <Action
              label="Older weight measurements"
              secondary
              busy={busy}
              onPress={() => void reload(true)}
            />
          )}
        </>
      )}
      {(history || !!error) && !editing && (
        <Action
          label="Reload weight history"
          secondary
          busy={busy}
          onPress={() => {
            setError('');
            void reload();
          }}
        />
      )}
    </View>
  );
}
