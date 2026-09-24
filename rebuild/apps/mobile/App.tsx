import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { ProfileSchema, type Activity, type Profile, type Result, type Session } from '@fitquest-rebuild/contracts';
import { expireFixture, fixtureLabel, lockFixture, optIn, readAccess, selectFixture, type FixtureId } from './src/access';
import { LocalStore, type FailurePhase } from './src/store';
import { EditorCoordinator, type EditorStamp, type EditorState } from './src/editor';
import { AccountTransitions } from './src/accountTransitions';
import { chooseResultIntent, submitResultIntent, type ResultIntent } from './src/resultIntent';

const c = { bg: '#F5F7F6', white: '#FFFFFF', ink: '#142A2A', muted: '#526363', teal: '#17685E', error: '#AF303C', line: '#798989' };
const uuid = () => Crypto.randomUUID();
const now = () => new Date().toISOString();
const localDate = (instant: string, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
const initialProfile: Profile = { displayName: null, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, units: { load: 'lb', distance: 'mi' } };
type State = 'Unsaved changes' | 'Saving on this device…' | 'Saved on this device · Waiting to sync' | 'Draft saved on this device' | 'Couldn’t save latest changes';
type Form = { kind: 'strength' | 'timed'; resultId: string | null; reps: string; duration: string; loadKind: 'none' | 'external' | 'bodyweight' | 'assisted'; mass: string; massUnit: 'lb' | 'kg'; basis: 'total' | 'per_dumbbell' | 'per_implement'; count: string; method: string; side: Result['side']; repBasis: 'movement_cycles' | 'per_side' | 'total_alternating'; rpe: string; rir: string; notes: string };
const blank = (kind: Form['kind'], massUnit: Form['massUnit'] = 'lb'): Form => ({ kind, resultId: null, reps: '', duration: '', loadKind: 'none', mass: '', massUnit, basis: 'total', count: '', method: '', side: 'bilateral', repBasis: 'movement_cycles', rpe: '', rir: '', notes: '' });

function Button({ label, action, plain = false }: { label: string; action: () => void; plain?: boolean }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={action} style={{ minHeight: 48, padding: 12, marginVertical: 4, borderRadius: 12, justifyContent: 'center', backgroundColor: plain ? c.white : c.teal, borderColor: c.line, borderWidth: plain ? 1 : 0 }}><Text style={{ color: plain ? c.ink : c.white, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>{label}</Text></Pressable>; }
function Field({ label, value, change, numeric = false, inputRef, error }: { label: string; value: string; change: (v: string) => void; numeric?: boolean; inputRef?: React.RefObject<TextInput | null>; error?: string }) { return <View style={{ marginVertical: 6, gap: 4 }}><Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }}>{label}</Text><TextInput ref={inputRef} accessibilityLabel={label} value={value} onChangeText={change} keyboardType={numeric ? 'decimal-pad' : 'default'} returnKeyType="done" style={{ minHeight: 48, padding: 12, borderWidth: 1, borderColor: error ? c.error : c.line, borderRadius: 12, backgroundColor: c.white, color: c.ink, fontSize: 17 }} />{error ? <Text accessibilityRole="alert" style={{ color: c.error, fontSize: 15 }}>{error}</Text> : null}</View>; }
function Choice<T extends string>({ label, values, value, change }: { label: string; values: readonly T[]; value: T; change: (v: T) => void }) { return <View style={{ gap: 5, marginVertical: 6 }}><Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }}>{label}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{values.map(v => <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: value === v }} accessibilityLabel={`${label}: ${v}`} onPress={() => change(v)} style={{ padding: 10, minHeight: 44, borderWidth: 1, borderRadius: 10, borderColor: value === v ? c.teal : c.line, backgroundColor: value === v ? '#DCEFEB' : c.white }}><Text style={{ color: c.ink, fontSize: 15 }}>{v.replaceAll('_', ' ')}</Text></Pressable>)}</View></View>; }
function Card({ children }: { children: React.ReactNode }) { return <View style={{ padding: 16, marginVertical: 7, borderRadius: 12, backgroundColor: c.white, gap: 5 }}>{children}</View>; }
function Heading({ children }: { children: React.ReactNode }) { return <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 27, fontWeight: '700', marginVertical: 8 }}>{children}</Text>; }
function Info({ children }: { children: React.ReactNode }) { return <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22 }}>{children}</Text>; }

function Main() {
  const insets = useSafeAreaInsets();
  const [opted, setOpted] = useState(false), [account, setAccount] = useState<FixtureId | null>(null);
  const [store, setStore] = useState<LocalStore | null>(null), active = useRef<LocalStore | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null), [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string | null>(null), [activityId, setActivityId] = useState<string | null>(null);
  const [page, setPage] = useState<'home' | 'profile' | 'session' | 'status'>('home');
  const [status, setStatus] = useState<State>('Unsaved changes'), [draftStatus, setDraftStatus] = useState<State>('Unsaved changes'), [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const zoneRef = useRef<TextInput>(null), nickRef = useRef<TextInput>(null), nameRef = useRef<TextInput>(null);
  const repsRef = useRef<TextInput>(null), durationRef = useRef<TextInput>(null), massRef = useRef<TextInput>(null), methodRef = useRef<TextInput>(null), rpeRef = useRef<TextInput>(null), rirRef = useRef<TextInput>(null), countRef = useRef<TextInput>(null);
  const [nick, setNick] = useState(''), [zone, setZone] = useState(initialProfile.timeZone), [loadUnit, setLoadUnit] = useState<'lb' | 'kg'>('lb'), [distanceUnit, setDistanceUnit] = useState<'mi' | 'km'>('mi');
  const [name, setName] = useState(''), [variation, setVariation] = useState('Standard'), [equipment, setEquipment] = useState(''), [kind, setKind] = useState<Form['kind']>('strength');
  const [form, setForm] = useState<Form>(blank('strength'));
  const editor = useRef(new EditorCoordinator()).current, intent = useRef<ResultIntent<Form> | null>(null);
  const transitions = useRef(new AccountTransitions()).current;
  const [failure, setFailure] = useState<FailurePhase | null>(null);
  const [nativeReport, setNativeReport] = useState<string[]>([]);
  const [armStale, setArmStale] = useState(false);
  const busy = useRef<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const session = sessions.find(s => s.id === selected) ?? null, activity = session?.activities.find(a => a.id === activityId) ?? null;
  const formHasInput = form.resultId !== null || form.reps !== '' || form.duration !== '' || form.loadKind !== 'none' || form.rpe !== '' || form.rir !== '' || form.notes !== '';
  const editing = page === 'profile' || (page === 'session' && (activity ? formHasInput : session?.status === 'started'));
  const visibleStatus = status === 'Saving on this device…' ? status : editing ? draftStatus : status;
  useEffect(() => { const ticket = transitions.snapshot(); readAccess().then(async s => { if (!transitions.current(ticket)) return; if (s) { setOpted(true); if (s.active) await open(s.active, s.generation, ticket); } }).catch(e => { if (transitions.current(ticket)) setError(String(e)); }); }, []);
  function showFieldError(field: string, message: string) {
    const scope = editor.stamp().scope;
    setFieldError(field); setError(message);
    const fields: Record<string, React.RefObject<TextInput | null>> = { zone: zoneRef, nick: nickRef, name: nameRef, reps: repsRef, duration: durationRef, mass: massRef, method: methodRef, rpe: rpeRef, rir: rirRef, count: countRef };
    requestAnimationFrame(() => { if (editor.currentScope(scope)) fields[field]?.current?.focus(); });
  }

  const writeDraft = (key: string, raw: string, sequence: number) => {
    const s = active.current;
    if (!s) return Promise.reject(new Error('Account locked'));
    return s.saveDraft(key, raw, sequence);
  };
  function draftFeedback(state: EditorState, stamp: EditorStamp, reason?: unknown) {
    if (!editor.current(stamp)) return;
    setDraftStatus(state);
    if (reason) setError(String(reason));
  }
  function resetAccount() {
    editor.resetScope(); intent.current = null; active.current = null; busy.current = null;
    setStore(null); setAccount(null); setProfile(null); setSessions([]); setSelected(null); setActivityId(null); setPage('home');
    setNick(''); setZone(initialProfile.timeZone); setLoadUnit('lb'); setDistanceUnit('mi'); setName(''); setVariation('Standard'); setEquipment(''); setKind('strength'); setForm(blank('strength'));
    setStatus('Unsaved changes'); setDraftStatus('Unsaved changes'); setError(''); setFieldError(null); setNativeReport([]); setFailure(null); setArmStale(false); setExpired(false); setPendingCount(0);
  }
  async function loadDraft(key: string, apply: (raw: string) => void, s: LocalStore = active.current!, emptyStatus: State = 'Unsaved changes') {
    const waiting = editor.select(key, 0);
    setDraftStatus('Unsaved changes');
    try {
      const record = await s.draftRecord(key);
      if (active.current !== s || !editor.sameEditor(waiting)) return;
      if (!editor.current(waiting)) { editor.rebase(waiting, record?.sequence ?? 0); return; }
      editor.select(key, record?.sequence ?? 0);
      if (record?.raw) { apply(record.raw); setDraftStatus('Draft saved on this device'); }
      else setDraftStatus(emptyStatus);
    } catch (e) { if (active.current === s && editor.current(waiting)) setError(String(e)); }
  }
  async function open(id: FixtureId, generation: number, ticket: number) {
    const next = await LocalStore.open(id, generation);
    try {
      const [p, ss, commands, access] = await Promise.all([next.profile(), next.sessions(), next.pendingCommands(), readAccess()]);
      if (!transitions.current(ticket)) return;
      active.current = next; setStore(next); setAccount(id); setProfile(p); setSessions(ss); setSelected(null); setActivityId(null);
      setNick(p?.displayName ?? ''); setZone(p?.timeZone ?? initialProfile.timeZone); setLoadUnit(p?.units.load ?? 'lb'); setDistanceUnit(p?.units.distance ?? 'mi'); setPage(p ? 'home' : 'profile'); setError(''); setStatus('Saved on this device · Waiting to sync'); setExpired(access?.expired.includes(id) ?? false); setPendingCount(commands.length);
      if (!p) await loadDraft('profile', raw => { const d = JSON.parse(raw) as { nick: string; zone: string; loadUnit: 'lb' | 'kg'; distanceUnit: 'mi' | 'km' }; setNick(d.nick); setZone(d.zone); setLoadUnit(d.loadUnit); setDistanceUnit(d.distanceUnit); }, next);
    } finally { if (active.current !== next) await next.close(); }
  }
  function queueTransition(work: (ticket: number) => Promise<void>, lockMode: 'switch' | 'logout' | 'revoke' = 'switch') {
    const old = active.current, oldProfile = profile, probe = armStale;
    transitions.run(resetAccount, async ticket => {
      try {
        if (old || lockMode !== 'switch') await lockFixture(lockMode === 'revoke');
        if (old) await old.close();
        if (!transitions.current(ticket)) return;
        await work(ticket);
        if (probe && old && oldProfile && transitions.current(ticket)) {
          try { await old.saveProfile(oldProfile, uuid()); setNativeReport(['FAILED: stale prior-account save was accepted']); }
          catch { setNativeReport(['Stale prior-account callback rejected after switch']); }
        }
      } catch (e) { if (transitions.current(ticket)) setError(String(e)); }
    });
  }
  function choose(id: FixtureId) { queueTransition(async ticket => { const state = await selectFixture(id); if (transitions.current(ticket)) await open(id, state.generation, ticket); }); }
  function exit(revoke: boolean) { queueTransition(async () => undefined, revoke ? 'revoke' : 'logout'); }
  function requestSwitch(id: FixtureId) {
    if (account && account !== id && pendingCount > 0) Alert.alert('Some records haven’t synced', 'They will stay locked on this device for this account. Return to the same synthetic identity to continue.', [{ text: 'Stay signed in' }, { text: 'Switch and keep records', onPress: () => void choose(id) }]);
    else void choose(id);
  }
  function requestExit(revoke: boolean) {
    if (pendingCount > 0) Alert.alert('Some records haven’t synced', 'They will stay locked on this device for this account.', [{ text: 'Stay signed in' }, { text: 'Sign out and keep records', onPress: () => void exit(revoke) }]);
    else void exit(revoke);
  }
  async function refresh(s: LocalStore) { const [p, ss, commands] = await Promise.all([s.profile(), s.sessions(), s.pendingCommands()]); if (active.current === s) { setProfile(p); setSessions(ss); setPendingCount(commands.length); } }
  async function commit(fn: (s: LocalStore, operation: string) => Promise<void>, operation = uuid()): Promise<boolean> {
    const s = active.current; if (!s || busy.current) return false; busy.current = operation; setStatus('Saving on this device…'); setError('');
    try { if (failure) { s.injectFailureOnce(failure); setFailure(null); } await fn(s, operation); await refresh(s); if (active.current !== s) return false; setStatus('Saved on this device · Waiting to sync'); return true; }
    catch (e) { if (active.current === s) { setStatus('Couldn’t save latest changes'); setError(String(e)); } return false; }
    finally { if (busy.current === operation) busy.current = null; }
  }
  function update(next: Form) {
    intent.current = null; setForm(next); setFieldError(null); setStatus('Unsaved changes');
    editor.edit(JSON.stringify(next), writeDraft, draftFeedback);
  }
  async function openActivity(key: string) { setActivityId(key); intent.current = null; setForm(blank('strength', loadUnit)); const s = active.current; if (s) await loadDraft(`result:${key}`, raw => { const value = JSON.parse(raw) as Form | ResultIntent<Form>; if ('form' in value) { intent.current = value; setForm(value.form); } else setForm(value); }, s); }
  function updateProfileDraft(next: { nick: string; zone: string; loadUnit: 'lb' | 'kg'; distanceUnit: 'mi' | 'km' }) {
    setNick(next.nick); setZone(next.zone); setLoadUnit(next.loadUnit); setDistanceUnit(next.distanceUnit); setFieldError(null);
    editor.edit(JSON.stringify(next), writeDraft, draftFeedback);
  }
  function updateActivityDraft(next: { name: string; variation: string; equipment: string; kind: Form['kind'] }) {
    setName(next.name); setVariation(next.variation); setEquipment(next.equipment); setKind(next.kind); setFieldError(null);
    editor.edit(JSON.stringify(next), writeDraft, draftFeedback);
  }
  async function showProfile() {
    setPage('profile'); const s = active.current; if (!s) return;
    await loadDraft('profile', raw => { const d = JSON.parse(raw) as { nick: string; zone: string; loadUnit: 'lb' | 'kg'; distanceUnit: 'mi' | 'km' }; setNick(d.nick); setZone(d.zone); setLoadUnit(d.loadUnit); setDistanceUnit(d.distanceUnit); }, s, profile ? 'Saved on this device · Waiting to sync' : 'Unsaved changes');
  }
  async function showSession(key: string) {
    setSelected(key); setActivityId(null); setPage('session'); setName(''); setVariation('Standard'); setEquipment(''); setKind('strength'); const s = active.current; if (!s) return;
    await loadDraft(`activity:${key}`, raw => { const d = JSON.parse(raw) as { name: string; variation: string; equipment: string; kind: Form['kind'] }; setName(d.name); setVariation(d.variation); setEquipment(d.equipment); setKind(d.kind); }, s);
  }
  async function saveProfile() { const value = ProfileSchema.safeParse({ displayName: nick.trim() || null, timeZone: zone.trim(), units: { load: loadUnit, distance: distanceUnit } }); if (!value.success) { const issue = value.error.issues[0]; showFieldError(issue?.path[0] === 'displayName' ? 'nick' : 'zone', issue?.message ?? 'Invalid profile'); return; } setFieldError(null);
    const s = active.current; if (!s || busy.current) return;
    let stamp: EditorStamp;
    try { stamp = await editor.persist(JSON.stringify({ nick, zone, loadUnit, distanceUnit }), writeDraft, draftFeedback); }
    catch (e) { if (active.current === s) setError(String(e)); return; }
    if (active.current !== s) return;
    if (await commit((target, op) => target.saveProfileFromDraft(value.data, op, 'profile', stamp.sequence)) && editor.current(stamp)) { editor.select('profile', stamp.sequence); setDraftStatus('Saved on this device · Waiting to sync'); }
  }
  async function start() { if (!profile) return; const startedAt = now(), key = uuid(); const entry: Session = { id: key, origin: 'unplanned', title: null, status: 'started', startedAt, endedAt: null, timeZone: profile.timeZone, localDate: localDate(startedAt, profile.timeZone), activities: [], correctionReason: null }; if (await commit((s, op) => s.saveSession(entry, op))) await showSession(key); }
  async function change(next: Session) { return commit((s, op) => s.saveSession(next, op)); }
  async function addActivity() { if (!session || !name.trim()) { showFieldError('name', 'Enter an activity name'); return; } setFieldError(null); const s = active.current; if (!s || busy.current) return;
    let stamp: EditorStamp;
    try { stamp = await editor.persist(JSON.stringify({ name, variation, equipment, kind }), writeDraft, draftFeedback); }
    catch (e) { if (active.current === s) setError(String(e)); return; }
    if (active.current !== s) return;
    const key = uuid(); const a: Activity = { id: key, name: name.trim(), variation: { id: uuid(), label: variation.trim() || 'Standard' }, equipment: equipment.trim() ? { instanceId: null, label: equipment.trim() } : null, outcome: 'started', startedAt: now(), endedAt: null, results: [] };
    if (await commit((target, op) => target.saveSessionFromDraft({ ...session, activities: [...session.activities, a] }, op, `activity:${session.id}`, stamp.sequence)) && editor.current(stamp)) {
      setName(''); setEquipment(''); setActivityId(key); setForm(blank(kind, loadUnit)); editor.select(`result:${key}`, 0); setDraftStatus('Unsaved changes');
    }
  }
  function edit(r: Result) { if (r.kind === 'timed') update({ ...blank('timed', loadUnit), resultId: r.id, duration: r.duration?.value ?? '', side: r.side, notes: r.notes ?? '' }); else update({ ...blank('strength', loadUnit), massUnit: r.load?.kind === 'external' ? r.load.mass.unit : r.load?.kind === 'assisted' ? r.load.assistance?.unit ?? loadUnit : loadUnit, resultId: r.id, reps: r.repetitions?.toString() ?? '', loadKind: r.load?.kind ?? 'none', mass: r.load?.kind === 'external' ? r.load.mass.value : r.load?.kind === 'assisted' ? r.load.assistance?.value ?? '' : '', basis: r.load?.kind === 'external' ? r.load.basis : 'total', count: r.load?.kind === 'external' ? r.load.implementCount?.toString() ?? '' : '', method: r.load?.kind === 'assisted' ? r.load.method : '', side: r.side, repBasis: r.repetitionBasis, rpe: r.rpe ?? '', rir: r.rir ?? '', notes: r.notes ?? '' }); }
  async function saveResult() {
    if (!session || !activity) return;
    const ownerStore = active.current;
    if (session.status !== 'started' && form.resultId === null) { setError('Finished sessions only permit corrections'); return; }
    const submitted = form, sessionId = session.id, activityKey = activity.id, inputStamp = editor.stamp();
    try {
      const common = { id: submitted.resultId ?? uuid(), observedAt: null, capturedAt: now(), side: submitted.side, notes: submitted.notes.trim() || null, source: 'manual' as const, voided: false };
      const dec = (v: string) => /^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(v);
      let result: Result;
      if (form.kind === 'timed') { if (form.duration && !dec(form.duration)) throw Error('Duration must be a nonnegative decimal'); result = { ...common, kind: 'timed', duration: form.duration ? { value: form.duration, unit: 'min', accuracy: 'reported' } : null, durationMethod: form.duration ? 'manual' : null }; }
      else {
        if (form.reps && (!/^\d+$/.test(form.reps) || Number(form.reps) > 100000)) throw Error('Repetitions must be a whole number');
        if (form.mass && !dec(form.mass)) throw Error('Mass must be a nonnegative decimal');
        if (form.rpe && (!dec(form.rpe) || Number(form.rpe) > 10)) throw Error('RPE must be between 0 and 10');
        if (form.rir && (!dec(form.rir) || Number(form.rir) > 100)) throw Error('RIR must be between 0 and 100');
        if (form.count && (!/^\d+$/.test(form.count) || Number(form.count) < 1 || Number(form.count) > 100)) throw Error('Number of implements must be 1 to 100');
        let load: Extract<Result, { kind: 'strength' }>['load'] = null;
        if (form.loadKind === 'external') { if (!form.mass) throw Error('Enter mass or choose none'); load = { kind: 'external', mass: { value: form.mass, unit: form.massUnit, accuracy: 'reported' }, basis: form.basis, implementCount: form.count ? Number(form.count) : null }; }
        if (form.loadKind === 'bodyweight') load = { kind: 'bodyweight' };
        if (form.loadKind === 'assisted') { if (!form.method.trim()) throw Error('Enter assistance method'); load = { kind: 'assisted', assistance: form.mass ? { value: form.mass, unit: form.massUnit, accuracy: 'reported' } : null, method: form.method.trim() }; }
        result = { ...common, kind: 'strength', repetitions: form.reps === '' ? null : Number(form.reps), repetitionBasis: form.repBasis, load, rpe: form.rpe || null, rir: form.rir || null };
      }
      if (!submitted.reps && !submitted.duration && submitted.loadKind === 'none' && !submitted.rpe && !submitted.rir) Alert.alert('Actuals not entered', 'Save this entry with actuals not entered?', [{ text: 'Keep editing' }, { text: 'Save entry', onPress: () => void commitResult(result, submitted, sessionId, activityKey, inputStamp) }]); else await commitResult(result, submitted, sessionId, activityKey, inputStamp);
    } catch (e) {
      if (active.current !== ownerStore) return;
      const message = String(e);
      const lower = message.toLowerCase();
      const field = lower.includes('duration') ? 'duration' : lower.includes('repetitions') ? 'reps' : lower.includes('implements') ? 'count' : lower.includes('mass') || lower.includes('load') ? 'mass' : lower.includes('method') ? 'method' : lower.includes('rpe') ? 'rpe' : lower.includes('rir') ? 'rir' : null;
      if (field) showFieldError(field, message); else setError(message);
      setStatus('Unsaved changes');
    }
  }
  async function commitResult(result: Result, submitted: Form, sessionId: string, activityKey: string, inputStamp: EditorStamp) {
    const s = active.current, draftId = `result:${activityKey}`;
    if (!s || busy.current || !editor.current(inputStamp)) return;
    const pending = chooseResultIntent(intent.current, submitted, result, uuid(), sessionId, activityKey);
    intent.current = pending;
    let stamp: EditorStamp, attemptedCommit = false;
    try {
      stamp = await submitResultIntent(editor, pending, writeDraft, draftFeedback, async (savedIntent, committedStamp) => {
        if (active.current !== s) throw new Error('Account changed');
        attemptedCommit = true;
        if (!await commit((target) => target.saveResultFromDraft(sessionId, activityKey, savedIntent.result, savedIntent.operationId, draftId, committedStamp.sequence), savedIntent.operationId)) throw new Error('Local completion needs retry');
      });
    } catch (e) { if (active.current === s && !attemptedCommit) { setStatus('Couldn’t save latest changes'); setError(String(e)); } return; }
    if (editor.current(stamp)) { intent.current = null; setForm(blank(submitted.kind, loadUnit)); setDraftStatus('Unsaved changes'); }
  }
  async function outcome(value: Activity['outcome']) { if (session && activity) await change({ ...session, activities: session.activities.map(a => a.id === activity.id ? { ...a, outcome: value, endedAt: value === 'started' ? null : now() } : a) }); }
  async function finish(value: 'completed' | 'ended_early') { if (!session) return; if (session.activities.length === 0) { setError('Add an activity or keep the empty session unfinished'); return; } if (session.activities.some(a => a.outcome === 'started')) { setError('Choose an outcome for every activity first'); return; } await change({ ...session, status: value, endedAt: now() }); }

  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 48, paddingHorizontal: 18, gap: 5 }}>
    <Heading>FitQuest</Heading>{store ? <Info>{fixtureLabel()} · {account}</Info> : <Info>Real authentication is not connected. Athlete records are locked.</Info>}
    {error ? <Text accessibilityRole="alert" style={{ color: c.error, fontSize: 16, marginVertical: 8 }}>{error}</Text> : null}
    {store ? <Pressable accessibilityRole="button" onPress={() => setPage('status')}><Text style={{ color: visibleStatus === 'Couldn’t save latest changes' ? c.error : c.teal, fontSize: 15, marginVertical: 8 }}>Local: {visibleStatus} · Sync not connected · Details</Text></Pressable> : null}
    {!store && __DEV__ && !opted ? <Card><Heading>Local test setup</Heading><Info>Use synthetic data only. This developer fixture never signs in or syncs.</Info><Button label="Enable synthetic local test" action={() => { const ticket = transitions.snapshot(); optIn().then(() => { if (transitions.current(ticket)) setOpted(true); }).catch(e => { if (transitions.current(ticket)) setError(String(e)); }); }} /></Card> : null}
    {!store && __DEV__ && opted ? <Card><Heading>Choose test identity</Heading><Button label="Open synthetic A" action={() => void choose('A')} /><Button label="Open synthetic B" plain action={() => requestSwitch('B')} /></Card> : null}
    {store && page === 'profile' ? <><Heading>Profile setup</Heading><Info>Required for local sessions. Server setup is unconfirmed.</Info><Field label="Nickname (optional)" value={nick} inputRef={nickRef} error={fieldError === 'nick' ? error : undefined} change={v => updateProfileDraft({ nick: v, zone, loadUnit, distanceUnit })} /><Field label="IANA time zone" value={zone} inputRef={zoneRef} error={fieldError === 'zone' ? error : undefined} change={v => updateProfileDraft({ nick, zone: v, loadUnit, distanceUnit })} /><Choice label="Load unit" values={['lb', 'kg'] as const} value={loadUnit} change={v => updateProfileDraft({ nick, zone, loadUnit: v, distanceUnit })} /><Choice label="Distance unit" values={['mi', 'km'] as const} value={distanceUnit} change={v => updateProfileDraft({ nick, zone, loadUnit, distanceUnit: v })} /><Info>Input: {draftStatus} · Sync not connected</Info><Button label="Save profile on this device" action={() => void saveProfile()} />{profile ? <Button label="Back to sessions" plain action={() => setPage('home')} /> : null}</> : null}
    {store && page === 'home' ? <><Heading>Sessions</Heading><Info>Cached on this device only. More than one session can start today.</Info><Button label="Start unplanned session" action={() => void start()} />{sessions.map(s => <Card key={s.id}><Text style={{ color: c.ink, fontSize: 19, fontWeight: '600' }}>Session · {s.localDate}</Text><Info>{s.status.replace('_', ' ')} · {s.activities.length} activities · {s.timeZone}</Info><Button label={s.status === 'started' ? 'Resume session' : 'View session'} plain action={() => void showSession(s.id)} /></Card>)}<Button label="Edit profile" plain action={() => void showProfile()} /><Button label="Status and account" plain action={() => setPage('status')} /></> : null}
    {store && page === 'session' && session ? <><Heading>Unplanned session</Heading><Info>{session.status.replace('_', ' ')} · {session.localDate} · {session.timeZone}</Info><Info>Started {session.startedAt}{session.endedAt ? ` · Ended ${session.endedAt}` : ''}</Info><Button label="Back to sessions" plain action={() => { editor.select('', 0); setPage('home'); setActivityId(null); }} />{session.activities.map(a => <Card key={a.id}><Text style={{ color: c.ink, fontSize: 18, fontWeight: '600' }}>{a.name}</Text><Info>{a.variation.label}{a.equipment ? ` · ${a.equipment.label}` : ''} · {a.outcome} · {a.results.length} entries</Info><Button label={`Open ${a.name}`} plain action={() => void openActivity(a.id)} /></Card>)}
      {session.status === 'started' && !activity ? <Card><Heading>Add activity</Heading><Field label="Activity name" value={name} inputRef={nameRef} error={fieldError === 'name' ? error : undefined} change={v => updateActivityDraft({ name: v, variation, equipment, kind })} /><Choice label="Entry method" values={['strength', 'timed'] as const} value={kind} change={v => updateActivityDraft({ name, variation, equipment, kind: v })} /><Field label="Variation" value={variation} change={v => updateActivityDraft({ name, variation: v, equipment, kind })} /><Field label="Equipment label (optional)" value={equipment} change={v => updateActivityDraft({ name, variation, equipment: v, kind })} /><Info>Input: {draftStatus} · Sync not connected</Info><Button label="Add activity to session" action={() => void addActivity()} /></Card> : null}
      {activity ? <Card><Heading>{activity.name}</Heading><Info>{activity.variation.label} · {activity.outcome}</Info>{activity.results.map((r, i) => <View key={r.id} style={{ borderTopWidth: 1, borderColor: '#D4DEDB', paddingTop: 10 }}><Text style={{ color: c.ink, fontSize: 17 }}>{r.kind === 'strength' ? `Set ${i + 1}: ${r.repetitions ?? 'Not entered'} reps (${r.repetitionBasis.replaceAll('_', ' ')}, ${r.side}) · ${r.load?.kind === 'external' ? `${r.load.mass.value} ${r.load.mass.unit} ${r.load.basis.replaceAll('_', ' ')}` : r.load?.kind ?? 'Load not entered'}` : `Time ${i + 1}: ${r.duration ? `${r.duration.value} ${r.duration.unit}` : 'Not entered'}`}</Text><Button label={`Correct entry ${i + 1}`} plain action={() => edit(r)} /></View>)}
        {(session.status === 'started' || form.resultId !== null) ? <>{session.status === 'started' ? <Choice label="Entry method" values={['strength', 'timed'] as const} value={form.kind} change={v => update(blank(v, loadUnit))} /> : null}{form.kind === 'strength' ? <><Field label="Repetitions (blank means not entered)" value={form.reps} inputRef={repsRef} error={fieldError === 'reps' ? error : undefined} numeric change={v => update({ ...form, reps: v })} /><Choice label="Repetition basis" values={['movement_cycles', 'per_side', 'total_alternating'] as const} value={form.repBasis} change={v => update({ ...form, repBasis: v })} /><Choice label="Side" values={['bilateral', 'left', 'right', 'alternating', 'not_applicable'] as const} value={form.side} change={v => update({ ...form, side: v, repBasis: v === 'alternating' ? 'total_alternating' : form.repBasis === 'total_alternating' ? 'movement_cycles' : form.repBasis })} /><Choice label="Load" values={['none', 'external', 'bodyweight', 'assisted'] as const} value={form.loadKind} change={v => update({ ...form, loadKind: v })} />{form.loadKind === 'external' || form.loadKind === 'assisted' ? <Field label={`${form.loadKind === 'assisted' ? 'Assistance' : 'Mass'} (${form.massUnit})`} value={form.mass} inputRef={massRef} error={fieldError === 'mass' ? error : undefined} numeric change={v => update({ ...form, mass: v })} /> : null}{form.loadKind === 'external' || form.loadKind === 'assisted' ? <Choice label="Mass unit" values={['lb', 'kg'] as const} value={form.massUnit} change={v => update({ ...form, massUnit: v })} /> : null}{form.loadKind === 'external' ? <><Choice label="Load basis" values={['total', 'per_dumbbell', 'per_implement'] as const} value={form.basis} change={v => update({ ...form, basis: v })} /><Field label="Number of implements (optional)" value={form.count} inputRef={countRef} error={fieldError === 'count' ? error : undefined} numeric change={v => update({ ...form, count: v })} /></> : null}{form.loadKind === 'assisted' ? <Field label="Assistance method" value={form.method} inputRef={methodRef} error={fieldError === 'method' ? error : undefined} change={v => update({ ...form, method: v })} /> : null}<Field label="RPE (optional)" value={form.rpe} inputRef={rpeRef} error={fieldError === 'rpe' ? error : undefined} numeric change={v => update({ ...form, rpe: v })} /><Field label="RIR (optional)" value={form.rir} inputRef={rirRef} error={fieldError === 'rir' ? error : undefined} numeric change={v => update({ ...form, rir: v })} /></> : <Field label="Manual duration (minutes; blank means not entered)" value={form.duration} inputRef={durationRef} error={fieldError === 'duration' ? error : undefined} numeric change={v => update({ ...form, duration: v })} />}<Field label="Notes (optional)" value={form.notes} change={v => update({ ...form, notes: v })} /><Info>Input: {formHasInput ? draftStatus : 'Ready for another entry'} · Sync not connected</Info><Button label={status === 'Couldn’t save latest changes' ? 'Retry local save' : form.resultId ? 'Save correction' : form.kind === 'strength' ? 'Save set' : 'Save time'} action={() => void saveResult()} />{session.status === 'started' ? <Choice label="Activity outcome" values={['started', 'completed', 'partial', 'skipped'] as const} value={activity.outcome} change={v => void outcome(v)} /> : null}</> : null}<Button label="Back to session" plain action={() => { setActivityId(null); if (session) void showSession(session.id); }} /></Card> : null}
      {session.status === 'started' && !activity ? <Card><Heading>Session outcome</Heading><Info>Choose each activity outcome. Leaving this screen keeps the session unfinished.</Info><Button label="Finish session" action={() => void finish('completed')} /><Button label="End early" plain action={() => void finish('ended_early')} /></Card> : null}</> : null}
    {store && page === 'status' ? <><Heading>Status and account</Heading><Card><Info>Latest visible input: {visibleStatus}</Info><Info>Synchronization is not connected. {pendingCount} pending commands stay on this device.</Info><Info>Synthetic {account}. {expired ? 'Credential expired; local capture remains available.' : 'Credential active for this fixture.'} Logout and revocation lock access.</Info><Button label="Back" plain action={() => setPage(profile ? 'home' : 'profile')} /></Card>{__DEV__ ? <Card><Heading>Developer checks</Heading><Button label="Run native storage checks" plain action={() => { const scope = editor.stamp().scope; setNativeReport(['Running…']); store.runNativeChecks().then(lines => { if (active.current === store && editor.currentScope(scope)) { setNativeReport(lines); void refresh(store); } }).catch(e => { if (active.current === store && editor.currentScope(scope)) setNativeReport([`FAILED: ${String(e)}`]); }); }} />{nativeReport.map((line, i) => <Info key={i}>{line}</Info>)}<Button label="Arm stale callback test for next switch" plain action={() => setArmStale(true)} /><Info>{armStale ? 'Stale callback test armed; switch accounts to run it.' : 'Stale callback test idle.'}</Info><Button label="Expire synthetic credential" plain action={() => { const scope = editor.stamp().scope; expireFixture().then(() => { if (editor.currentScope(scope)) setExpired(true); }).catch(e => { if (editor.currentScope(scope)) setError(String(e)); }); }} /><Choice label="Fail next local save" values={['after_projection', 'after_revision', 'after_command'] as const} value={failure ?? 'after_projection'} change={setFailure} /><Info>{failure ? `Next save fails ${failure}` : 'Choose a phase to fail once.'}</Info><Button label="Open synthetic A" plain action={() => requestSwitch('A')} /><Button label="Open synthetic B" plain action={() => requestSwitch('B')} /><Button label="Sign out and keep records" plain action={() => requestExit(false)} /><Button label="Confirm synthetic revocation and lock" plain action={() => requestExit(true)} /></Card> : null}</> : null}
  </ScrollView></KeyboardAvoidingView>;
}
export default function App() { return <SafeAreaProvider><Main /></SafeAreaProvider>; }
