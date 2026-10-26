import { useWeightUnits } from '../account/WeightUnitPreference';
import { weightNumber, weightLabel, type WeightUnit } from '../account/weightUnits';
import { ExercisePrescription } from '../../components/ExercisePrescription';
import { Icon } from '../../components/Icon';
import { ExerciseInfo } from '../../components/ExerciseInfo';
import { WorkoutMarkdown } from '../training/WorkoutMarkdown';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Action, Notice, Page, colors, ui } from '../../components/Design';
import { operationId } from '../onboarding/onboardingApi';
import {
  journalToday,
  loggingModes,
  resultLogged,
  type Journal,
  type JournalCommand,
  type JournalDocument,
  type JournalList,
  type JournalReceipt,
  type JournalResult,
  type JournalSource,
} from '../../../../backend/src/shared/journalContract';
import { privateJournalDrafts } from './journalStorage';
import type { JournalDraft } from './journalDraft';
import { journalRequest, JournalError } from './journalApi';
import { JournalExercise } from './JournalExercise';
import {
  editableJournal,
  loggingFor,
  emptySet,
  restoreJournalDraft,
  finishVisibleSets,
} from './journalSets';
import { acknowledgeJournal, journalProjection, journalSourceKey } from './journalEdits';
type Access = {
  userId: string;
  accessToken: () => Promise<string>;
  onSessionEnded?: () => void;
  onBack: () => void;
};
import { JournalField } from './JournalField';
export { JournalField } from './JournalField';
const modeLabel = {
  weighted_reps: 'Weight and reps',
  reps: 'Reps only',
  completion: 'Completion only',
};
export function JournalScreen(
  props: Access & {
    source?: JournalSource;
    journalId?: string;
    draftKey?: string;
    repeat?: boolean;
  },
) {
  return (
    <JournalEditor
      key={
        props.userId +
        ':' +
        (props.journalId ?? props.draftKey ?? journalSourceKey(props.source)) +
        ':' +
        !!props.repeat
      }
      {...props}
    />
  );
}
function JournalEditor({
  userId,
  accessToken,
  onSessionEnded,
  onBack,
  source,
  journalId,
  draftKey,
  repeat = false,
}: Access & { source?: JournalSource; journalId?: string; draftKey?: string; repeat?: boolean }) {
  const { unit } = useWeightUnits();
  const unitRef = useRef(unit);
  unitRef.current = unit;
  const [draft, setDraft] = useState<JournalDraft | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [retry, setRetry] = useState(0),
    [editable, setEditable] = useState(true),
    [menu, setMenu] = useState<string | null>(null),
    [latest, setLatest] = useState<Journal | null>(null),
    [newName, setNewName] = useState(''),
    [adding, setAdding] = useState(false);
  const current = useRef<JournalDraft | null>(null),
    live = useRef(true),
    lock = useRef(false),
    controller = useRef<AbortController | null>(null),
    persistVersion = useRef(0);
  const token = useRef(accessToken);
  token.current = accessToken;
  const dimensions = useWindowDimensions();
  const stacked = dimensions.width < 400 || dimensions.fontScale > 1.1;
  const paint = (d: JournalDraft) => {
    current.current = d;
    if (live.current) setDraft(d);
  };
  async function persist(d: JournalDraft) {
    const version = ++persistVersion.current;
    await privateJournalDrafts.write(userId, d);
    if (live.current && version === persistVersion.current)
      setNotice(d.pending || d.dirty ? 'Saved on device · Waiting to sync' : 'Saved');
  }
  function change(d: JournalDraft) {
    if (!live.current) return;
    const next = { ...d, dirty: true, savedAt: Date.now() };
    paint(next);
    setNotice('Saving on this device…');
    void persist(next).catch(() => {
      if (live.current)
        setError('Could not save this device draft. Keep this screen open and retry saving.');
    });
  }
  function documentChange(patch: Partial<JournalDocument>) {
    const d = current.current;
    if (d?.document) change({ ...d, document: { ...d.document, ...patch } });
  }
  function fieldChange(key: string, value: string, inputUnit?: WeightUnit) {
    const d = current.current;
    if (d) {
      const document = d.document ? structuredClone(d.document) : null;
      const [resultId, groupId] = key.split(':');
      const group = document?.results
        .find((r) => r.id === resultId)
        ?.groups.find((g) => g.id === groupId);
      if (group && document?.version === 2) {
        if (inputUnit && key.endsWith(':weight')) {
          if (group.weight !== null && group.unit !== inputUnit)
            group.weight = Number(weightNumber(group.weight, group.unit, inputUnit));
          group.unit = inputUnit;
        }
        group.confirmed = document.outcome !== 'in_progress' && !d.finishRequested;
      }
      change({ ...d, document, fields: { ...d.fields, [key]: value } });
    }
  }
  useEffect(() => {
    live.current = true;
    controller.current = null;
    let active = true;
    void (async () => {
      try {
        const all = await privateJournalDrafts.list(userId);
        if (!active) return;
        const foundRaw = draftKey
          ? all.find((d) => d.key === draftKey)
          : journalId
            ? all.find((d) => d.journal?.id === journalId)
            : !repeat && source
              ? all
                  .filter((d) => journalSourceKey(d.source) === journalSourceKey(source))
                  .sort((a, b) => b.savedAt - a.savedAt)[0]
              : undefined;
        const found = foundRaw ? restoreJournalDraft(foundRaw, operationId) : undefined;
        if (found) {
          if (found !== foundRaw) await persist(found);
          paint(found);
          setNotice(
            found.pending ? 'Waiting to sync' : found.dirty ? 'Saved on this device' : 'Saved',
          );
          setEditable(
            found.dirty || !!found.pending || found.journal?.document.outcome === 'in_progress',
          );
          if (found.journal && !found.dirty && !found.pending)
            await loadJournal(found.journal.id, found);
          else if (found.pending) await transmit(found);
          else if (found.conflicted && found.journal) {
            setLatest(await request<Journal>('/' + found.journal.id));
            setError(
              'This log changed elsewhere. Review the saved version before applying your retained edits.',
            );
          }
          return;
        }
        if (journalId) {
          await loadJournal(journalId);
          return;
        }
        const cmd: JournalCommand = {
          operationId: operationId(),
          kind: 'begin',
          source: source ?? null,
          repeat,
          title: '',
          performedDate: journalToday(Intl.DateTimeFormat().resolvedOptions().timeZone),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        const d: JournalDraft = {
          key: cmd.operationId,
          journal: null,
          source: source ?? null,
          document: null,
          pending: cmd,
          fields: {},
          dirty: false,
          savedAt: Date.now(),
        };
        await persist(d);
        if (!active) return;
        paint(d);
        await transmit(d);
      } catch (e) {
        if (active) {
          setError(
            e instanceof JournalError
              ? e.message
              : 'Could not restore this account’s journal. Your stored draft has not been removed.',
          );
          if (e instanceof JournalError && e.code === 'session_ended') onSessionEnded?.();
        }
      }
    })();
    return () => {
      active = false;
      live.current = false;
      controller.current?.abort();
    };
  }, [userId, retry]);
  useEffect(() => {
    if (!draft?.dirty || draft.pending || draft.conflicted || busy || latest || !editable) return;
    const timer = setTimeout(() => void save(), draft.finishRequested ? 0 : 1000);
    return () => clearTimeout(timer);
  }, [draft, busy, latest, editable]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const d = current.current;
      if (!d) return;
      if (state === 'active') {
        if (d.pending) void transmit(d);
        else if (d.dirty && !latest && !d.conflicted) void save();
      } else if (!d.pending && d.dirty && !d.conflicted) void save();
    });
    return () => subscription.remove();
  }, [latest]);
  async function request<T extends Journal | JournalList | JournalReceipt>(
    path: string,
    cmd?: JournalCommand,
  ) {
    const c = controller.current ?? new AbortController();
    controller.current = c;
    return journalRequest<T>(path, await token.current(), c.signal, cmd);
  }
  async function loadJournal(id: string, old?: JournalDraft) {
    setBusy(true);
    lock.current = true;
    try {
      const j = await request<Journal>('/' + id);
      if (!live.current) return;
      const prepared = editableJournal(j, operationId);
      const loaded: JournalDraft = {
        key: old?.key ?? id,
        journal: j,
        source: j.snapshot.source,
        document: prepared,
        baseline: structuredClone(prepared),
        pending: null,
        fields: old?.fields ?? {},
        dirty: false,
        savedAt: Date.now(),
      };
      const changedWithRaw =
        !!old?.journal && Object.keys(old.fields).length > 0 && old.journal.revision !== j.revision;
      const d = changedWithRaw
        ? { ...old!, pending: null, dirty: true, conflicted: true }
        : old && current.current && current.current !== old
          ? acknowledgeJournal(old, current.current, j)
          : loaded;
      paint(d);
      await persist(d);
      if (changedWithRaw) {
        setLatest(j);
        setError(
          'This log changed elsewhere. Review the saved version before applying recovered raw edits.',
        );
      }
      setEditable((current.current?.dirty ?? false) || j.document.outcome === 'in_progress');
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function transmit(d: JournalDraft) {
    if (lock.current || !d.pending) return;
    lock.current = true;
    setBusy(true);
    setError('');
    controller.current = new AbortController();
    const timer = setTimeout(() => controller.current?.abort(), 30000);
    let onDevice = false,
      acknowledged = false;
    try {
      await persist(d);
      onDevice = true;
      if (live.current) setNotice('Saving…');
      // A durable operation may have committed before its response was lost.
      // Reposting the identical command remains receipt-idempotent on older servers.
      const receipt = await request<JournalReceipt>('/commands', d.pending);
      const j = await request<Journal>('/' + receipt.journalId);
      if (!live.current) return;
      if (j.id !== receipt.journalId || j.revision < receipt.revision)
        throw new JournalError('unavailable');
      if (j.revision !== receipt.revision && d.pending.kind === 'save') {
        const retained = {
          ...(current.current ?? d),
          pending: null,
          dirty: true,
          conflicted: true,
        };
        paint(retained);
        await persist(retained);
        setLatest(j);
        setError(
          'This log changed elsewhere after your save. Review the saved version before applying retained edits.',
        );
        return;
      }
      acknowledged = true;
      const next = acknowledgeJournal(d, current.current ?? d, j);
      if (!next.dirty) {
        next.document = editableJournal(j, operationId);
        next.baseline = structuredClone(next.document);
      }
      paint(next);
      await persist(next);
      if (live.current) {
        setEditable((current.current?.dirty ?? false) || j.document.outcome === 'in_progress');
        setLatest(null);
      }
    } catch (e) {
      if (live.current) {
        if (onDevice)
          setNotice(acknowledged ? 'Saved on server' : 'Saved on device · Waiting to sync');
        setError(
          !onDevice
            ? 'Could not save this device draft. Keep this screen open and retry saving.'
            : acknowledged
              ? 'Saved to the server, but device recovery could not be updated. Retry device saving.'
              : e instanceof JournalError
                ? e.message
                : 'Unable to confirm this save. Your pending request remains on this device.',
        );
        if (e instanceof JournalError && e.code === 'session_ended') onSessionEnded?.();
        if (
          e instanceof JournalError &&
          ['invalid_request', 'future_journal', 'journal_identity_changed'].includes(e.code) &&
          d.pending?.kind === 'save'
        ) {
          const editableDraft = { ...(current.current ?? d), pending: null, dirty: true };
          paint(editableDraft);
          await persist(editableDraft);
        }
        if (e instanceof JournalError && e.code === 'journal_changed' && d.journal) {
          controller.current = new AbortController();
          try {
            setLatest(await request<Journal>('/' + d.journal.id));
          } catch {}
        }
      }
    } finally {
      clearTimeout(timer);
      controller.current = null;
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function save() {
    let d = current.current;
    if (!d?.document || !d.journal || lock.current || d.conflicted) return;
    const journal = d.journal;
    if (d.pending) {
      await transmit(d);
      return;
    }
    if (!d.dirty) return;
    if (d.finishRequested) {
      const prepared = finishVisibleSets(d, unitRef.current);
      if (
        JSON.stringify(prepared.document) !== JSON.stringify(d.document) ||
        JSON.stringify(prepared.fields) !== JSON.stringify(d.fields)
      ) {
        d = prepared;
        paint(d);
      }
    }
    const projection = journalProjection(d),
      doc = projection.document;
    if (!doc) {
      setNotice('Saved on device · Check the performed date, time zone and entries before syncing');
      return;
    }
    const incomplete = Object.keys(projection.activeIncomplete).length > 0;
    if (d.finishRequested && incomplete)
      doc.outcome = journal.document.outcome === 'finished' ? 'finished' : 'in_progress';
    if (JSON.stringify(doc) === JSON.stringify(d.baseline ?? journal.document)) {
      if (incomplete) {
        try {
          await persist(d);
          if (current.current === d)
            setNotice(
              d.finishRequested
                ? 'Saved on device · Complete or clear unfinished entries to finish'
                : 'Saved on device · Waiting to sync unfinished entries',
            );
        } catch {
          setError('Could not save this device draft. Keep this screen open and retry saving.');
        }
      } else {
        const clean = {
          ...d,
          document: doc,
          fields: projection.retained,
          dirty: false,
          finishRequested: false,
        };
        paint(clean);
        await persist(clean).catch(() =>
          setError('Could not save this device draft. Retry saving.'),
        );
      }
      return;
    }
    const next = {
      ...d,
      pending: {
        operationId: operationId(),
        kind: 'save' as const,
        journalId: journal.id,
        expectedRevision: journal.revision,
        document: doc,
      },
    };
    paint(next);
    await transmit(next);
  }
  function requestOutcome(outcome: 'finished' | 'in_progress') {
    const d = current.current;
    if (!d?.document) return;
    const next =
      outcome === 'finished'
        ? finishVisibleSets(d, unitRef.current)
        : {
            ...d,
            document: d.journal
              ? editableJournal({ ...d.journal, document: { ...d.document, outcome } }, operationId)
              : { ...d.document, outcome },
          };
    change({
      ...next,
      document: { ...next.document!, outcome },
      finishRequested: outcome === 'finished',
    });
    if (outcome === 'in_progress') setEditable(true);
    if (!lock.current) void save();
  }
  const doc = draft?.document,
    savedDoc = draft?.journal?.document,
    blocked = !editable;
  function rowChange(id: string, fn: (r: JournalResult) => void) {
    if (!current.current?.document) return;
    const next = structuredClone(current.current.document);
    fn(next.results.find((r) => r.id === id)!);
    documentChange(next);
  }
  function reapply() {
    if (!draft?.document || !latest) return;
    const document = structuredClone(draft.document);
    const prepared = editableJournal(latest, operationId);
    for (const r of prepared.results) {
      const mine = document.results.find((x) => x.id === r.id);
      if (!mine) document.results.push(r);
      else
        for (const g of r.groups) if (!mine.groups.some((x) => x.id === g.id)) mine.groups.push(g);
    }
    const next = {
      ...draft,
      journal: latest,
      baseline: prepared,
      document,
      pending: null,
      dirty: true,
      conflicted: false,
    };
    paint(next);
    setEditable(true);
    setLatest(null);
    setError('Your retained edits will sync after you finish reviewing them.');
    void persist(next).catch(() => setError('Could not save this device draft. Retry saving.'));
  }
  return (
    <Page onBack={onBack} backLabel="Back" scrollKey="journal-editor">
      <Text style={ui.eyebrow}>WORKOUT JOURNAL</Text>
      <Text accessibilityRole="header" style={ui.title}>
        {doc?.title ?? 'Opening workout…'}
      </Text>
      <Text accessibilityLiveRegion="polite" style={ui.copy}>
        {notice}
      </Text>
      {!!error && <Notice error>{error}</Notice>}
      {error.includes('device') && draft && (
        <Action
          label="Retry device save"
          secondary
          onPress={() =>
            void persist(current.current!)
              .then(() => setError(''))
              .catch(() =>
                setError(
                  'Could not save this device draft. Keep this screen open and retry saving.',
                ),
              )
          }
        />
      )}
      {draft?.finishRequested && (draft.dirty || draft.pending) && (
        <Notice>Finish pending · Latest entries are waiting for save confirmation.</Notice>
      )}
      {!draft && <Action label="Retry loading journal" onPress={() => setRetry((n) => n + 1)} />}
      {!!draft?.pending && (
        <Action label="Retry saved request" busy={busy} onPress={() => void transmit(draft)} />
      )}
      {latest && (
        <>
          <Notice title="Saved version">
            Revision {latest.revision} · {latest.document.outcome} · {latest.document.performedDate}
            {'\n'}Notes: {latest.document.notes || 'None'}
          </Notice>
          {latest.document.results.map((r) => (
            <Text key={r.id} style={ui.copy}>
              {r.name}:{' '}
              {r.mode === 'completion'
                ? r.completed === null
                  ? 'Not logged'
                  : r.completed
                    ? 'Completed'
                    : 'Not reported completed'
                : r.groups
                    .filter((g) => !g.removed)
                    .map(
                      (g) =>
                        `${g.weight === null ? '—' : weightNumber(g.weight, g.unit, unit)} ${weightLabel(unit)} · ${g.sets ?? '—'} sets · ${g.reps ?? '—'} reps`,
                    )
                    .join('; ')}
            </Text>
          ))}
          <Action label="Keep my edits on this version" secondary onPress={reapply} />
        </>
      )}
      {doc && draft && (
        <>
          {Object.entries(draft.fields)
            .filter(([key]) => {
              const [rowId, groupId, field] = key.split(':');
              return (
                field === 'sets' ||
                doc.results.find((r) => r.id === rowId)?.groups.find((g) => g.id === groupId)
                  ?.sets !== 1
              );
            })
            .map(([key, raw]) => (
              <View key={key} style={{ gap: 8 }}>
                <Text style={ui.copy}>
                  Recovered unfinished numeric entry: {raw || '(blank)'}. This older draft is kept
                  on this device.
                </Text>
                <Action
                  label={`Keep recovered numeric entry as notes ${key}`}
                  secondary
                  onPress={() => {
                    const currentDraft = current.current;
                    if (!currentDraft?.document) return;
                    const document = structuredClone(currentDraft.document),
                      row = document.results.find((r) => r.id === key.split(':')[0]);
                    if (!row) return;
                    const notes = [
                      row.notes ?? '',
                      `Recovered unfinished ${key.split(':')[2]}: ${raw}`,
                    ]
                      .filter(Boolean)
                      .join('\n');
                    if (notes.length > 2000) {
                      setError(
                        'The recovered text will exceed the exercise-note limit. Shorten the note before adding it.',
                      );
                      return;
                    }
                    row.notes = notes;
                    const fields = { ...currentDraft.fields };
                    delete fields[key];
                    change({ ...currentDraft, document, fields });
                  }}
                />
              </View>
            ))}
          {draft.source && (
            <Text style={ui.copy}>
              Planned {draft.source.date} · session {draft.source.sessionIndex + 1} · accepted
              revision {draft.source.revision}
            </Text>
          )}
          <Text style={ui.copy}>
            Saved outcome: {(savedDoc ?? doc).outcome.replace('_', ' ')} ·{' '}
            {(savedDoc ?? doc).results.filter(resultLogged).length} activities logged ·{' '}
            {(savedDoc ?? doc).results.filter((r) => !r.removed && !resultLogged(r)).length}{' '}
            unlogged. Blank entries stay unlogged.
          </Text>
          {!editable && <Action label="Edit log" secondary onPress={() => setEditable(true)} />}
          <View style={stacked ? { gap: 12 } : ui.row}>
            <JournalField
              label="Performed date (YYYY-MM-DD)"
              value={doc.performedDate}
              disabled={blocked}
              onChange={(performedDate) => documentChange({ performedDate })}
            />
            <JournalField
              label="Performed time zone"
              value={doc.timeZone}
              disabled={blocked}
              onChange={(timeZone) => documentChange({ timeZone })}
            />
          </View>
          {!draft.source && (
            <JournalField
              label="Workout name"
              value={doc.title}
              disabled={blocked}
              onChange={(title) => documentChange({ title })}
            />
          )}
          {draft.journal?.snapshot.workoutMarkdown && (
            <View style={ui.row}>
              <Text style={ui.label}>Session details</Text>
              <ExerciseInfo name={doc.title} prescription={draft.journal.snapshot.workoutMarkdown}>
                <WorkoutMarkdown source={draft.journal.snapshot.workoutMarkdown} />
              </ExerciseInfo>
            </View>
          )}
          {doc.results.map((r) => {
            const original = draft.journal?.snapshot.exercises.find((e) => e.id === r.id);
            return (
              <View
                key={r.id}
                style={{
                  gap: 10,
                  paddingVertical: 16,
                  borderBottomWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <View style={ui.row}>
                  <Text accessibilityRole="header" style={[ui.section, { flex: 1 }]}>
                    {r.name}
                  </Text>
                  <ExerciseInfo
                    name={r.name}
                    prescription={
                      original?.prescription ?? 'No prescription was saved for this added activity.'
                    }
                    description={original?.logging?.description}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Options for ${r.name}`}
                    accessibilityState={{ expanded: menu === r.id, disabled: blocked }}
                    disabled={blocked}
                    onPress={() => setMenu(menu === r.id ? null : r.id)}
                    style={{
                      minHeight: 44,
                      minWidth: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="ellipsis" />
                  </Pressable>
                </View>
                {original && (
                  <ExercisePrescription
                    prescription={original.prescription}
                    mode={r.mode}
                    hint={loggingFor(draft.journal!, r.id)}
                  />
                )}
                {menu === r.id && (
                  <>
                    <Text style={ui.label}>Change input type · entered values are retained</Text>
                    {loggingModes.map((mode) => (
                      <Action
                        key={mode}
                        label={modeLabel[mode]}
                        accessibilityLabel={`${r.name}: ${modeLabel[mode]}`}
                        secondary
                        disabled={blocked}
                        onPress={() => {
                          rowChange(r.id, (row) => (row.mode = mode));
                          setMenu(null);
                        }}
                      />
                    ))}
                    <Action
                      label={r.removed ? 'Restore exercise' : 'Remove exercise'}
                      accessibilityLabel={
                        r.removed ? `Restore ${r.name}` : `Remove ${r.name} from this log`
                      }
                      secondary
                      disabled={blocked}
                      onPress={() => rowChange(r.id, (row) => (row.removed = !row.removed))}
                    />
                  </>
                )}
                {r.removed ? (
                  <>
                    <Text style={ui.copy}>Removed from this log. Values retained.</Text>
                    <Action
                      label="Restore exercise"
                      accessibilityLabel={`Undo removal of ${r.name}`}
                      secondary
                      disabled={blocked}
                      onPress={() => rowChange(r.id, (row) => (row.removed = false))}
                    />
                  </>
                ) : (
                  <JournalExercise
                    result={r}
                    hint={loggingFor(draft.journal!, r.id)}
                    fields={draft.fields}
                    showRecommendations={doc.outcome === 'in_progress' || !!draft.finishRequested}
                    disabled={blocked}
                    onField={fieldChange}
                    onChange={(fn) => rowChange(r.id, fn)}
                  />
                )}
              </View>
            );
          })}
          {adding ? (
            <>
              <JournalField
                label="Activity name"
                value={newName}
                onChange={setNewName}
                disabled={blocked}
              />
              <Action
                label="Add named activity"
                secondary
                disabled={blocked || !newName.trim() || doc.results.length >= 96}
                onPress={() => {
                  documentChange({
                    ...doc,
                    results: [
                      ...doc.results,
                      {
                        id: operationId(),
                        name: newName.trim(),
                        mode: 'completion',
                        groups: [emptySet(operationId, unit)],
                        completed: null,
                        removed: false,
                        notes: '',
                      },
                    ],
                  });
                  setNewName('');
                  setAdding(false);
                }}
              />
            </>
          ) : (
            <Action
              label="Add activity"
              secondary
              disabled={blocked || doc.results.length >= 96}
              onPress={() => setAdding(true)}
            />
          )}
          <JournalField
            label="Notes for your coach · Optional"
            value={doc.notes}
            multiline
            disabled={blocked}
            onChange={(notes) => documentChange({ notes })}
          />
          <Text style={ui.copy}>
            Changes, substitutions, difficulty, pain or anything else. Saving notes makes no AI
            request. With your explicit planning permission, future plans can share these notes,
            including health feedback, with OpenAI.
          </Text>
          <Action
            label={draft.journal && draft.journal.revision > 1 ? 'Save changes' : 'Save workout'}
            busy={busy}
            disabled={!!draft.pending || !editable || !draft.dirty}
            onPress={() => void save()}
          />
          <Text style={ui.copy}>
            Finish records the values shown. Clear or remove sets you didn’t do; enter one number
            for any range.
          </Text>
          <Action
            label={doc.outcome === 'in_progress' ? 'Finish session' : 'Reopen session'}
            secondary
            disabled={doc.outcome === 'in_progress' && !editable}
            onPress={() =>
              requestOutcome(doc.outcome === 'in_progress' ? 'finished' : 'in_progress')
            }
          />
        </>
      )}
    </Page>
  );
}
export function JournalHistory(props: Access) {
  return <JournalHistoryAccount key={props.userId} {...props} />;
}
function JournalHistoryAccount({ userId, accessToken, onSessionEnded, onBack }: Access) {
  const [list, setList] = useState<JournalList>({ items: [], nextOffset: null }),
    [drafts, setDrafts] = useState<JournalDraft[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [selected, setSelected] = useState<{
      journalId?: string;
      draftKey?: string;
      source?: JournalSource;
      repeat?: boolean;
    } | null>(null),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (selected) return;
    const c = new AbortController();
    setLoading(true);
    setError('');
    void privateJournalDrafts
      .list(userId)
      .then((d) => {
        if (!c.signal.aborted) setDrafts(d);
      })
      .catch(() => {
        if (!c.signal.aborted)
          setError('Device journals could not be restored. They have not been removed.');
      });
    void accessToken()
      .then((t) => journalRequest<JournalList>('', t, c.signal))
      .then((v) => {
        if (!c.signal.aborted) setList(v);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          if (e instanceof JournalError && e.code === 'session_ended') onSessionEnded?.();
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [userId, selected, refresh]);
  async function more() {
    if (list.nextOffset === null) return;
    setLoading(true);
    try {
      const v = await journalRequest<JournalList>(
        '?offset=' + list.nextOffset,
        await accessToken(),
        new AbortController().signal,
      );
      setList({ items: [...list.items, ...v.items], nextOffset: v.nextOffset });
    } catch (e) {
      setError('Could not load older workouts.');
    } finally {
      setLoading(false);
    }
  }
  if (selected)
    return (
      <JournalScreen
        userId={userId}
        accessToken={accessToken}
        onSessionEnded={onSessionEnded}
        onBack={() => setSelected(null)}
        {...selected}
      />
    );
  return (
    <Page onBack={onBack} backLabel="Account">
      <Text accessibilityRole="header" style={ui.title}>
        Workout history.
      </Text>
      <Text style={ui.copy}>
        Your recorded work stays here when plans change. No log means no report, not skipped.
      </Text>
      {!!error && <Notice error>{error}</Notice>}
      <Action label="Record unplanned workout" onPress={() => setSelected({})} />
      {drafts
        .filter((d) => d.dirty || d.pending)
        .map((d) => (
          <Action
            key={d.key}
            label={`Continue device draft: ${d.document?.title ?? 'Workout'}`}
            secondary
            onPress={() => setSelected({ draftKey: d.key })}
          />
        ))}
      {list.items.map((j) => (
        <View
          key={j.id}
          style={{ gap: 5, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line }}
        >
          <Action
            label={`Open ${j.title} · ${j.performedDate}`}
            secondary
            onPress={() => setSelected({ journalId: j.id })}
          />
          <Text style={ui.copy}>
            {j.outcome.replace('_', ' ')} · revision {j.revision}
          </Text>
        </View>
      ))}
      {!list.items.length && !loading && <Text style={ui.copy}>No saved workout logs yet.</Text>}
      <Action
        label="Reload workout history"
        secondary
        busy={loading}
        onPress={() => setRefresh((n) => n + 1)}
      />
      {list.nextOffset !== null && (
        <Action label="Older workouts" secondary busy={loading} onPress={() => void more()} />
      )}
    </Page>
  );
}
