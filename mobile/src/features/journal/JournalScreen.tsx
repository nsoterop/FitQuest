import { Icon } from '../../components/Icon';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Action, Notice, Page, colors, ui } from '../../components/Design';
import { useConversationScroll } from '../../components/ConversationScrollView';
import { WorkoutMarkdown } from '../training/WorkoutMarkdown';
import { operationId } from '../onboarding/onboardingApi';
import {
  journalToday,
  loggingModes,
  resultLogged,
  validJournalDocument,
  type Journal,
  type JournalCommand,
  type JournalDocument,
  type JournalList,
  type JournalReceipt,
  type JournalResult,
  type JournalSource,
  type SetGroup,
} from '../../../../backend/src/shared/journalContract';
import { privateJournalDrafts } from './journalStorage';
import type { JournalDraft } from './journalDraft';
import { journalRequest, JournalError } from './journalApi';
type Access = {
  userId: string;
  accessToken: () => Promise<string>;
  onSessionEnded?: () => void;
  onBack: () => void;
};
export function JournalField({
  label,
  visibleLabel,
  value,
  onChange,
  numeric = false,
  integer = false,
  multiline = false,
  disabled = false,
}: {
  label: string;
  visibleLabel?: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  integer?: boolean;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const view = useRef<View | null>(null),
    focused = useRef(false),
    scroll = useConversationScroll();
  const [showDone, setShowDone] = useState(false);
  const reveal = () => scroll.reveal({ composer: view, question: view });
  return (
    <View
      ref={view}
      collapsable={false}
      onLayout={() => {
        if (focused.current) reveal();
      }}
      style={{ gap: 5, flexGrow: 1, minWidth: 80 }}
    >
      <Text style={ui.label}>{visibleLabel ?? label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        keyboardType={numeric ? (integer ? 'number-pad' : 'decimal-pad') : 'default'}
        multiline={multiline}
        maxLength={multiline ? 4000 : 160}
        style={[
          ui.input,
          multiline && { minHeight: 100, maxHeight: 145, textAlignVertical: 'top' },
        ]}
        onFocus={() => {
          focused.current = true;
          setShowDone(true);
          scroll.reveal({ composer: view, question: view }, true);
        }}
        onBlur={() => {
          focused.current = false;
          setShowDone(false);
        }}
        onContentSizeChange={() => {
          if (focused.current) reveal();
        }}
      />
      {showDone && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done editing"
          onPress={() => {
            Keyboard.dismiss();
            setShowDone(false);
          }}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: colors.action }}>Done</Text>
        </Pressable>
      )}
    </View>
  );
}
const newGroup = (): SetGroup => ({
  id: operationId(),
  weight: null,
  sets: null,
  reps: null,
  unit: 'lb',
  removed: false,
});
const modeLabel = {
  weighted_reps: 'Weight, sets and reps',
  reps: 'Sets and reps',
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
        (props.journalId ?? props.draftKey ?? JSON.stringify(props.source)) +
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
  const [draft, setDraft] = useState<JournalDraft | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [retry, setRetry] = useState(0),
    [editable, setEditable] = useState(true),
    [menu, setMenu] = useState<string | null>(null),
    [outcomes, setOutcomes] = useState(false),
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
      setNotice(d.pending ? 'Waiting to sync' : d.dirty ? 'Saved on this device' : 'Saved');
  }
  function change(d: JournalDraft) {
    if (lock.current) return;
    const next = { ...d, dirty: true, savedAt: Date.now() };
    paint(next);
    setNotice('Saving on this device…');
    void persist(next).catch(() => {
      if (live.current)
        setError('Could not save this device draft. Keep this screen open and retry saving.');
    });
  }
  function documentChange(d: JournalDocument) {
    if (current.current) change({ ...current.current, document: d });
  }
  useEffect(() => {
    live.current = true;
    controller.current = null;
    let active = true;
    void (async () => {
      try {
        const all = await privateJournalDrafts.list(userId);
        if (!active) return;
        const found = draftKey
          ? all.find((d) => d.key === draftKey)
          : journalId
            ? all.find((d) => d.journal?.id === journalId)
            : !repeat && source
              ? all.find((d) => JSON.stringify(d.source) === JSON.stringify(source))
              : undefined;
        if (found) {
          paint(found);
          setNotice(
            found.pending ? 'Waiting to sync' : found.dirty ? 'Saved on this device' : 'Saved',
          );
          setEditable(
            found.dirty || !!found.pending || found.journal?.document.outcome === 'in_progress',
          );
          if (found.journal && !found.dirty && !found.pending)
            await loadJournal(found.journal.id, found);
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
      const d: JournalDraft = {
        key: old?.key ?? id,
        journal: j,
        source: j.snapshot.source,
        document: structuredClone(j.document),
        pending: null,
        fields: {},
        dirty: false,
        savedAt: Date.now(),
      };
      await persist(d);
      paint(d);
      setEditable(j.document.outcome === 'in_progress');
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
    try {
      await persist(d);
      const receipt = await request<JournalReceipt>('/commands', d.pending);
      const j = await request<Journal>('/' + receipt.journalId);
      const next: JournalDraft = {
        ...d,
        journal: j,
        source: j.snapshot.source,
        document: structuredClone(j.document),
        pending: null,
        fields: {},
        dirty: false,
        savedAt: Date.now(),
      };
      await persist(next);
      if (live.current) {
        paint(next);
        setEditable(j.document.outcome === 'in_progress');
        setLatest(null);
      }
    } catch (e) {
      if (live.current) {
        setError(
          e instanceof JournalError
            ? e.message
            : 'Unable to confirm this save. Your pending request remains on this device.',
        );
        if (e instanceof JournalError && e.code === 'session_ended') onSessionEnded?.();
        if (
          e instanceof JournalError &&
          ['invalid_request', 'future_journal', 'journal_identity_changed'].includes(e.code) &&
          d.pending?.kind === 'save'
        ) {
          const editableDraft = { ...d, pending: null, dirty: true };
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
  async function save(outcome?: JournalDocument['outcome']) {
    const d = current.current;
    if (!d?.document || !d.journal || busy) return;
    if (d.pending) {
      await transmit(d);
      return;
    }
    const doc = structuredClone(d.document);
    if (outcome) doc.outcome = outcome;
    try {
      for (const r of doc.results)
        for (const g of r.groups)
          for (const f of ['weight', 'sets', 'reps'] as const) {
            const raw = d.fields[`${r.id}:${g.id}:${f}`];
            if (raw !== undefined) {
              if (raw.trim() === '') g[f] = null;
              else {
                if (!(f === 'weight' ? /^\d+(\.\d+)?$/ : /^\d+$/).test(raw.trim())) throw Error();
                g[f] = Number(raw);
              }
            }
          }
      if (!validJournalDocument(doc)) throw Error();
    } catch {
      setError(
        'Use non-negative numbers for weight and whole numbers for sets and reps. Blank stays unlogged; zero is allowed.',
      );
      return;
    }
    const next = {
      ...d,
      document: doc,
      pending: {
        operationId: operationId(),
        kind: 'save' as const,
        journalId: d.journal.id,
        expectedRevision: d.journal.revision,
        document: doc,
      },
    };
    paint(next);
    await transmit(next);
  }
  const doc = draft?.document,
    savedDoc = draft?.journal?.document,
    blocked = busy || !!draft?.pending || !editable;
  function rowChange(id: string, fn: (r: JournalResult) => void) {
    if (!doc) return;
    const next = structuredClone(doc);
    fn(next.results.find((r) => r.id === id)!);
    documentChange(next);
  }
  function reapply() {
    if (!draft?.document || !latest) return;
    const document = structuredClone(draft.document);
    for (const r of latest.document.results) {
      const mine = document.results.find((x) => x.id === r.id);
      if (!mine) document.results.push(r);
      else
        for (const g of r.groups) if (!mine.groups.some((x) => x.id === g.id)) mine.groups.push(g);
    }
    const next = { ...draft, journal: latest, document, pending: null, dirty: true };
    paint(next);
    setEditable(true);
    setLatest(null);
    setError('Review your retained changes and save explicitly.');
    void persist(next);
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
                        `${g.weight ?? '—'} ${g.unit} · ${g.sets ?? '—'} sets · ${g.reps ?? '—'} reps`,
                    )
                    .join('; ')}
            </Text>
          ))}
          <Action label="Keep my edits on this version" secondary onPress={reapply} />
        </>
      )}
      {doc && draft && (
        <>
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
            unlogged. Finishing does not fill missing results.
          </Text>
          {!editable && <Action label="Edit log" secondary onPress={() => setEditable(true)} />}
          <View style={stacked ? { gap: 12 } : ui.row}>
            <JournalField
              label="Performed date (YYYY-MM-DD)"
              value={doc.performedDate}
              disabled={blocked}
              onChange={(performedDate) => documentChange({ ...doc, performedDate })}
            />
            <JournalField
              label="Performed time zone"
              value={doc.timeZone}
              disabled={blocked}
              onChange={(timeZone) => documentChange({ ...doc, timeZone })}
            />
          </View>
          {!draft.source && (
            <JournalField
              label="Workout name"
              value={doc.title}
              disabled={blocked}
              onChange={(title) => documentChange({ ...doc, title })}
            />
          )}
          {draft.journal?.snapshot.workoutMarkdown && (
            <>
              <Text style={ui.label}>Original prescription</Text>
              <WorkoutMarkdown source={draft.journal.snapshot.workoutMarkdown} />
            </>
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
                {original && <Text style={ui.copy}>Planned: {original.prescription}</Text>}
                {menu === r.id && (
                  <>
                    <Text style={ui.label}>Change input type · entered values are retained</Text>
                    {loggingModes.map((mode) => (
                      <Action
                        key={mode}
                        label={`${r.name}: ${modeLabel[mode]}`}
                        secondary
                        disabled={blocked}
                        onPress={() => {
                          rowChange(r.id, (row) => (row.mode = mode));
                          setMenu(null);
                        }}
                      />
                    ))}
                    <Action
                      label={r.removed ? `Restore ${r.name}` : `Remove ${r.name} from this log`}
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
                      label={`Undo removal of ${r.name}`}
                      secondary
                      disabled={blocked}
                      onPress={() => rowChange(r.id, (row) => (row.removed = false))}
                    />
                  </>
                ) : r.mode === 'completion' ? (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Completed ${r.name}`}
                    accessibilityState={{ checked: r.completed === true, disabled: blocked }}
                    disabled={blocked}
                    onPress={() =>
                      rowChange(
                        r.id,
                        (row) => (row.completed = row.completed === true ? false : true),
                      )
                    }
                    style={[ui.row, { minHeight: 48, justifyContent: 'flex-start' }]}
                  >
                    <Icon
                      name={r.completed === true ? 'square-check' : 'square'}
                      color={r.completed === true ? colors.action : colors.muted}
                    />
                    <Text style={ui.copy}>
                      Completed{r.completed === null ? ' · Not logged' : ''}
                    </Text>
                  </Pressable>
                ) : (
                  <>
                    {r.groups.map((g, gi) =>
                      g.removed ? (
                        <Action
                          key={g.id}
                          label={`Undo removal of ${r.name} group ${gi + 1}`}
                          secondary
                          disabled={blocked}
                          onPress={() =>
                            rowChange(r.id, (row) => (row.groups[gi]!.removed = false))
                          }
                        />
                      ) : (
                        <View key={g.id} style={{ gap: 8 }}>
                          {r.groups.length > 1 && <Text style={ui.label}>Set group {gi + 1}</Text>}
                          <View style={stacked ? { gap: 12 } : ui.row}>
                            {(r.mode === 'weighted_reps'
                              ? (['weight', 'sets', 'reps'] as const)
                              : (['sets', 'reps'] as const)
                            ).map((f) => {
                              const key = `${r.id}:${g.id}:${f}`;
                              return (
                                <JournalField
                                  key={f}
                                  label={`${r.name} · group ${gi + 1} · ${f === 'weight' ? `Weight (${g.unit})` : f === 'sets' ? 'Sets' : 'Reps'}`}
                                  visibleLabel={
                                    f === 'weight'
                                      ? `Weight (${g.unit})`
                                      : f === 'sets'
                                        ? 'Sets'
                                        : 'Reps'
                                  }
                                  numeric
                                  integer={f !== 'weight'}
                                  value={draft.fields[key] ?? (g[f] === null ? '' : String(g[f]))}
                                  disabled={blocked}
                                  onChange={(v) =>
                                    change({ ...draft, fields: { ...draft.fields, [key]: v } })
                                  }
                                />
                              );
                            })}
                          </View>
                          {r.mode === 'weighted_reps' && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Change weight unit for ${r.name} group ${gi + 1}`}
                              disabled={blocked}
                              onPress={() =>
                                rowChange(
                                  r.id,
                                  (row) => (row.groups[gi]!.unit = g.unit === 'lb' ? 'kg' : 'lb'),
                                )
                              }
                              style={{ minHeight: 44, justifyContent: 'center' }}
                            >
                              <Text style={{ color: colors.action }}>
                                Unit: {g.unit} · change (values are not converted)
                              </Text>
                            </Pressable>
                          )}
                          {r.groups.length > 1 && (
                            <Action
                              label={`Remove ${r.name} group ${gi + 1}`}
                              secondary
                              disabled={blocked}
                              onPress={() =>
                                rowChange(r.id, (row) => (row.groups[gi]!.removed = true))
                              }
                            />
                          )}
                        </View>
                      ),
                    )}
                    <Action
                      label={`Add set group for ${r.name}`}
                      secondary
                      disabled={blocked || r.groups.length >= 24}
                      onPress={() => rowChange(r.id, (row) => row.groups.push(newGroup()))}
                    />
                  </>
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
                        groups: [newGroup()],
                        completed: null,
                        removed: false,
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
            onChange={(notes) => documentChange({ ...doc, notes })}
          />
          <Text style={ui.copy}>
            Changes, substitutions, difficulty, pain or anything else. Saving notes makes no AI
            request. With your explicit planning permission, future plans can share these notes,
            including health feedback, with OpenAI.
          </Text>
          <Action
            label={draft.journal && draft.journal.revision > 1 ? 'Save changes' : 'Save workout'}
            busy={busy}
            disabled={!!draft.pending || !editable}
            onPress={() => void save()}
          />
          <Action
            label={doc.outcome === 'in_progress' ? 'Finish session' : 'Reopen session'}
            secondary
            disabled={busy || !!draft.pending || (doc.outcome === 'in_progress' && !editable)}
            onPress={() =>
              doc.outcome === 'in_progress' ? setOutcomes(!outcomes) : void save('in_progress')
            }
          />
          {outcomes && (
            <View style={ui.row}>
              {(['completed', 'partial', 'skipped'] as const).map((outcome) => (
                <Action
                  key={outcome}
                  label={
                    outcome === 'completed'
                      ? 'Record completed'
                      : outcome === 'partial'
                        ? 'Record partial'
                        : 'Record skipped'
                  }
                  secondary
                  disabled={blocked}
                  onPress={() => {
                    setOutcomes(false);
                    void save(outcome);
                  }}
                />
              ))}
            </View>
          )}
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
