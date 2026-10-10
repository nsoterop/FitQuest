import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Page, Action, Notice, Tabs, ui, type MainTab } from '../../components/Design';
import { FoodField } from './NutritionScreen';
import {
  foodToday,
  foodTotal,
  nutrients,
  type FoodItem,
  type FoodEntry,
} from '../../../../backend/src/shared/foodContract';
import {
  libraryFood,
  validLibraryDocument,
  validLibraryCommand,
  type LibraryItem,
  type LibraryCommand,
  type LibraryReceipt,
  type LibraryState,
  type LibraryDocument,
} from '../../../../backend/src/shared/foodContract';
import { libraryRequest, FoodError } from './foodApi';
import { privateLibraryDrafts } from '../onboarding/onboardingDraftStorage';
import { emptyLibraryDraft, type LibraryDraft } from './foodLibraryDraft';
import { operationId } from '../onboarding/onboardingApi';
const blank = (): FoodItem => ({
  name: '',
  portion: '',
  quantity: null,
  unit: null,
  nutrients: {
    calories: { value: null, source: 'unknown' },
    protein: { value: null, source: 'unknown' },
    carbs: { value: null, source: 'unknown' },
    fat: { value: null, source: 'unknown' },
  },
});
const sources = {
  supplied: 'Your label / supplied',
  estimated: 'AI estimate',
  user_estimated: 'Your estimate',
  unknown: 'Unknown',
};
const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });
export function LibrarySummary({
  item,
  servings,
  ingredients = true,
}: {
  item: LibraryItem;
  servings: number;
  ingredients?: boolean;
}) {
  const doc = libraryFood(item, servings, '2026-01-01', null, 'UTC');
  return (
    <View style={{ gap: 10 }}>
      <Text style={ui.section}>{item.document.name}</Text>
      <Text style={ui.copy}>
        Version {item.revision} · {item.document.yield} servings per batch
      </Text>
      <Text style={ui.label}>{servings} servings</Text>
      {nutrients.map((n) => {
        const t = foodTotal([doc], n);
        return (
          <Text key={n} style={ui.copy}>
            {n}: {fmt(t.value)} {n === 'calories' ? 'kcal' : 'g'}
            {t.unknown ? ` known subtotal · ${t.unknown} unknown` : ''}
            {t.estimated ? ' · includes estimates' : ''}
          </Text>
        );
      })}
      {item.document.assumptions.map((a, i) => (
        <Notice key={i}>{a}</Notice>
      ))}
      {ingredients &&
        item.document.ingredients.map((i, index) => (
          <View key={index} style={{ gap: 4 }}>
            <Text style={ui.label}>
              {i.item.name} · {i.amount} × {i.item.portion}
            </Text>
            {nutrients.map((n) => (
              <Text style={ui.copy} key={n}>
                {n}:{' '}
                {i.item.nutrients[n].value === null
                  ? 'Unknown'
                  : `${fmt(i.item.nutrients[n].value!)} ${n === 'calories' ? 'kcal' : 'g'} per base portion`}{' '}
                · {sources[i.item.nutrients[n].source]}
              </Text>
            ))}
          </View>
        ))}
    </View>
  );
}
type Props = {
  userId: string;
  accessToken: () => Promise<string>;
  onSessionEnded?: () => void;
  onAccount?: () => void;
  onTab: (tab: MainTab) => void;
  onBack: () => void;
  date: string;
  sourceEntry: FoodEntry | null;
};
export function FoodLibraryScreen({
  userId,
  accessToken,
  onSessionEnded,
  onAccount,
  onTab,
  onBack,
  date,
  sourceEntry,
}: Props) {
  const [items, setItems] = useState<LibraryItem[] | null>(null),
    [draft, setDraft] = useState<LibraryDraft>(emptyLibraryDraft),
    [ready, setReady] = useState(false),
    [view, setView] = useState<'list' | 'detail' | 'edit' | 'log'>('list'),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [blocked, setBlocked] = useState(false),
    [storageError, setStorageError] = useState(false);
  const live = useRef(true),
    running = useRef<AbortController | null>(null),
    ref = useRef(draft),
    token = useRef(accessToken);
  ref.current = draft;
  token.current = accessToken;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  function change(d: LibraryDraft) {
    const next = { ...d, savedAt: Date.now() };
    ref.current = next;
    setDraft(next);
  }
  async function persist(d: LibraryDraft) {
    try {
      await privateLibraryDrafts.write(userId, { ...d, savedAt: Date.now() });
      if (live.current) setStorageError(false);
    } catch {
      if (live.current) setStorageError(true);
      throw Error('storage');
    }
  }
  async function run(
    fn: (
      request: <T extends LibraryState | LibraryReceipt>(
        path: string,
        body?: unknown,
      ) => Promise<T>,
    ) => Promise<void>,
  ) {
    if (running.current) return;
    const c = new AbortController();
    running.current = c;
    setBusy(true);
    setError('');
    const timer = setTimeout(() => c.abort(), 20000);
    try {
      const t = await token.current();
      if (!live.current || c.signal.aborted) return;
      await fn(async <T extends LibraryState | LibraryReceipt>(path: string, body?: unknown) => {
        const v = await libraryRequest<T>(path, body, t, c.signal);
        if (!live.current || c.signal.aborted) throw Error();
        return v;
      });
    } catch (e) {
      if (live.current) {
        if (e instanceof FoodError && e.code === 'session_ended') onSessionEnded?.();
        else
          setError(
            e instanceof FoodError
              ? e.message
              : 'Couldn’t confirm the result. Check saved status before retrying.',
          );
      }
    } finally {
      clearTimeout(timer);
      if (running.current === c) {
        running.current = null;
        if (live.current) setBusy(false);
      }
    }
  }
  async function load() {
    await run(async (r) => setItems((await r<LibraryState>('')).items));
  }
  useEffect(() => {
    live.current = true;
    void privateLibraryDrafts
      .read(userId)
      .then((d) => {
        if (!live.current) return;
        if (d) {
          change(d);
          setBlocked(!!d.pending);
        }
        setReady(true);
      })
      .catch(() => {
        if (live.current) {
          setStorageError(true);
          setReady(true);
        }
      });
    return () => {
      live.current = false;
      running.current?.abort();
    };
  }, [userId]);
  useEffect(() => {
    if (ready) {
      void load();
    }
  }, [ready]);
  useEffect(() => {
    if (ready) void persist(draft).catch(() => {});
  }, [draft, ready]);
  async function received(
    result: LibraryReceipt,
    r: <T extends LibraryState | LibraryReceipt>(path: string, body?: unknown) => Promise<T>,
  ) {
    const kind = ref.current.pending?.kind;
    const next = emptyLibraryDraft();
    await persist(next);
    change(next);
    setBlocked(false);
    setSelected(result.libraryId);
    setView('list');
    setNotice(
      kind === 'log'
        ? 'Added to your food diary.'
        : kind === 'saveEntry'
          ? 'Saved to your library. No additional food was logged.'
          : 'Saved for future use. Earlier diary entries are unchanged.',
    );
    setItems((await r<LibraryState>('')).items);
  }
  async function submit(cmd: LibraryCommand) {
    if (busy || blocked || storageError) return;
    if (ref.current.pending && ref.current.pending.operationId !== cmd.operationId) {
      setError('Check or retry your saved request first.');
      return;
    }
    const next = { ...ref.current, pending: cmd };
    try {
      await persist(next);
    } catch {
      return;
    }
    change(next);
    setBlocked(true);
    await run(async (r) => {
      try {
        await received(await r<LibraryReceipt>('/commands', cmd), r);
      } catch (e) {
        if (e instanceof FoodError && e.code !== 'unavailable') {
          change({ ...next, pending: null });
          setBlocked(false);
          if (e.code === 'library_changed') setItems((await r<LibraryState>('')).items);
        }
        throw e;
      }
    });
  }
  async function check() {
    await run(async (r) => {
      const cmd = ref.current.pending;
      if (!cmd) return;
      try {
        await received(await r<LibraryReceipt>(`/operations/${cmd.operationId}`), r);
      } catch (e) {
        if (e instanceof FoodError && e.code === 'food_operation_missing') {
          setBlocked(false);
          setNotice('Not found. You can retry the same saved request.');
        } else throw e;
      }
    });
  }
  const item = items?.find((i) => i.id === selected),
    doc = draft.document,
    hasDraft = !!doc || !!draft.pending || Object.keys(draft.fields).length > 0;
  const current = draft.editingId ? items?.find((i) => i.id === draft.editingId) : undefined,
    stale = !!current && current.revision !== draft.revision;
  const disabled = busy || blocked || storageError;
  function edit(item?: LibraryItem) {
    if (hasDraft) {
      setError('Resume or discard the current draft first.');
      return;
    }
    change({
      ...emptyLibraryDraft(),
      document: item
        ? structuredClone(item.document)
        : {
            kind: 'recipe',
            name: '',
            meal: 'Meal',
            yield: 1,
            defaultServings: 1,
            ingredients: [{ item: blank(), amount: 1 }],
            assumptions: [],
          },
      editingId: item?.id ?? null,
      revision: item?.revision ?? null,
    });
    setView('edit');
  }
  function field(label: string, value: string, onChange: (v: string) => void, numeric = false) {
    return (
      <FoodField
        label={label}
        value={value}
        onChange={onChange}
        numeric={numeric}
        disabled={disabled}
      />
    );
  }
  function update(d: LibraryDocument) {
    change({ ...draft, document: d });
  }
  function numeric(key: string, value: string, apply: (d: LibraryDocument, n: number) => void) {
    const d = structuredClone(doc!);
    apply(d, Number(value));
    change({ ...draft, document: d, fields: { ...draft.fields, [key]: value } });
  }
  const count = Number(draft.fields.servings ?? item?.document.defaultServings ?? 1),
    logDate = draft.fields.date ?? date,
    logTime = draft.fields.time ?? '';
  const logCommand: LibraryCommand | null = item
    ? {
        operationId: operationId(),
        kind: 'log',
        libraryId: item.id,
        expectedRevision: draft.revision ?? item.revision,
        servings: count,
        date: logDate,
        time: logTime || null,
        timeZone: zone,
        confirmConsumed: true,
      }
    : null;
  return (
    <Page
      onAccount={onAccount}
      onBack={() => {
        if (view === 'list') onBack();
        else setView('list');
      }}
      backLabel={view === 'list' ? 'Food diary' : 'Library'}
      scrollKey={view}
      footer={<Tabs nutrition value="nutrition" onChange={onTab} />}
    >
      <Text style={ui.title}>
        {view === 'edit'
          ? 'Edit recipe.'
          : view === 'log'
            ? 'Log servings.'
            : 'Saved meals & recipes.'}
      </Text>
      {!!error && <Notice error>{error}</Notice>}
      {!!notice && <Notice>{notice}</Notice>}
      {storageError && (
        <>
          <Notice error>Couldn’t preserve your draft. Keep this screen open and retry.</Notice>
          <Action
            label="Retry library draft save"
            onPress={() => void persist(ref.current).catch(() => {})}
          />
        </>
      )}
      {blocked && (
        <>
          <Notice>Check the saved result before submitting again.</Notice>
          <Action label="Check library status" busy={busy} onPress={() => void check()} />
        </>
      )}
      {!blocked && draft.pending && (
        <Action
          label="Retry saved library request"
          disabled={busy || storageError}
          onPress={() => void submit(draft.pending!)}
        />
      )}
      {!ready ? (
        <Text style={ui.copy}>Restoring your draft…</Text>
      ) : (
        <>
          {view === 'list' && (
            <>
              <Text style={ui.copy}>
                Reuse meals and recipes without AI. Saving to this library adds nothing to your
                consumed totals.
              </Text>
              {sourceEntry && !notice && (
                <>
                  <Text style={ui.section}>{sourceEntry.document.name}</Text>
                  <Text style={ui.copy}>
                    Save the recorded portions and nutrient sources for next time.
                  </Text>
                  <Action
                    label="Confirm save meal to library"
                    disabled={disabled || hasDraft}
                    onPress={() =>
                      void submit({
                        operationId: operationId(),
                        kind: 'saveEntry',
                        entryId: sourceEntry.id,
                        expectedRevision: sourceEntry.revision,
                      })
                    }
                  />
                </>
              )}
              {hasDraft && (
                <Action
                  label="Resume library draft"
                  secondary
                  disabled={busy || blocked}
                  onPress={() => {
                    if (doc) setView('edit');
                    else if (draft.editingId) {
                      setSelected(draft.editingId);
                      setView('log');
                    }
                  }}
                />
              )}
              <Action
                label="Create recipe"
                disabled={disabled || hasDraft}
                onPress={() => edit()}
              />
              {items === null ? (
                <Notice>{busy ? 'Loading your library…' : 'Couldn’t load your library.'}</Notice>
              ) : !items.length ? (
                <Notice>No saved meals or recipes yet.</Notice>
              ) : (
                items.map((i) => (
                  <Action
                    key={i.id}
                    label={`${i.document.name} · v${i.revision}`}
                    secondary
                    onPress={() => {
                      setSelected(i.id);
                      setView('detail');
                    }}
                  />
                ))
              )}
              <Action label="Reload library" secondary busy={busy} onPress={() => void load()} />
            </>
          )}
          {view === 'detail' && item && (
            <>
              <LibrarySummary item={item} servings={1} />
              <Text style={ui.copy}>
                Recipe edits affect future uses. Previously logged entries keep their recorded
                version.
              </Text>
              <Action
                label="Log this meal"
                disabled={disabled || hasDraft}
                onPress={() => {
                  change({
                    ...emptyLibraryDraft(),
                    editingId: item.id,
                    revision: item.revision,
                    fields: { servings: String(item.document.defaultServings), date, time: '' },
                  });
                  setView('log');
                }}
              />
              <Action
                label="Edit saved recipe"
                secondary
                disabled={disabled || hasDraft}
                onPress={() => edit(item)}
              />
            </>
          )}
          {view === 'log' && item && (
            <>
              {stale && (
                <>
                  <Notice error>
                    This recipe changed. Review its current version before logging.
                  </Notice>
                  <Action
                    label="Use this recipe version"
                    disabled={disabled}
                    onPress={() => change({ ...draft, revision: item.revision })}
                  />
                </>
              )}
              {Number.isFinite(count) && count > 0 && count <= 100 && (
                <LibrarySummary item={item} servings={count} ingredients={false} />
              )}
              <View style={ui.row}>
                {[0.5, 1, 1.5].map((n) => (
                  <Action
                    key={n}
                    label={`${n} servings`}
                    secondary
                    disabled={disabled}
                    onPress={() =>
                      change({ ...draft, fields: { ...draft.fields, servings: String(n) } })
                    }
                  />
                ))}
              </View>
              {field(
                'Servings consumed',
                draft.fields.servings ?? '',
                (v) => change({ ...draft, fields: { ...draft.fields, servings: v } }),
                true,
              )}
              {field('Consumed date (YYYY-MM-DD)', logDate, (v) =>
                change({ ...draft, fields: { ...draft.fields, date: v } }),
              )}
              {field('Time eaten (HH:MM, optional)', logTime, (v) =>
                change({ ...draft, fields: { ...draft.fields, time: v } }),
              )}
              <Action
                label="Confirm eaten — add to diary"
                disabled={
                  disabled || stale || !validLibraryCommand(logCommand) || logDate > foodToday(zone)
                }
                onPress={() => void submit(logCommand!)}
              />
            </>
          )}
          {view === 'edit' && doc && (
            <>
              <Text style={ui.copy}>
                Enter nutrition per listed base portion. Ingredient amounts multiply those values;
                batch yield divides the batch into servings. Blank nutrients stay unknown.
              </Text>
              {stale && (
                <>
                  <Notice error>
                    A newer version was saved. Your edits are preserved; review the latest recipe
                    before keeping them.
                  </Notice>
                  <LibrarySummary item={current!} servings={1} />
                  <Action
                    label="Keep my edits on latest version"
                    disabled={disabled}
                    onPress={() => change({ ...draft, revision: current!.revision })}
                  />
                </>
              )}
              {field('Recipe name', doc.name, (v) => update({ ...doc, name: v }))}
              {field('Meal category', doc.meal, (v) => update({ ...doc, meal: v }))}
              {field(
                'Batch yield (servings)',
                draft.fields.yield ?? String(doc.yield),
                (v) =>
                  numeric('yield', v, (d, n) => {
                    d.yield = n;
                  }),
                true,
              )}
              {field(
                'Default servings to log',
                draft.fields.defaultServings ?? String(doc.defaultServings),
                (v) =>
                  numeric('defaultServings', v, (d, n) => {
                    d.defaultServings = n;
                  }),
                true,
              )}
              {doc.ingredients.map((ingredient, index) => (
                <View
                  key={index}
                  style={{ gap: 12, borderTopWidth: 1, borderColor: '#ddd', paddingTop: 18 }}
                >
                  {field(`Ingredient ${index + 1}`, ingredient.item.name, (v) => {
                    const d = structuredClone(doc);
                    d.ingredients[index]!.item.name = v;
                    d.ingredients[index]!.item.quantity = null;
                    d.ingredients[index]!.item.unit = null;
                    for (const n of nutrients)
                      if (d.ingredients[index]!.item.nutrients[n].source === 'estimated')
                        d.ingredients[index]!.item.nutrients[n] = {
                          value: null,
                          source: 'unknown',
                        };
                    update(d);
                  })}
                  {field(`Base portion ${index + 1}`, ingredient.item.portion, (v) => {
                    const d = structuredClone(doc);
                    d.ingredients[index]!.item.portion = v;
                    d.ingredients[index]!.item.quantity = null;
                    d.ingredients[index]!.item.unit = null;
                    for (const n of nutrients)
                      if (d.ingredients[index]!.item.nutrients[n].source === 'estimated')
                        d.ingredients[index]!.item.nutrients[n] = {
                          value: null,
                          source: 'unknown',
                        };
                    update(d);
                  })}
                  {field(
                    `Amount ${index + 1} (× base portion)`,
                    draft.fields[`${index}.amount`] ?? String(ingredient.amount),
                    (v) =>
                      numeric(`${index}.amount`, v, (d, n) => {
                        d.ingredients[index]!.amount = n;
                      }),
                    true,
                  )}
                  {nutrients.map((n) => (
                    <View key={n} style={{ gap: 4 }}>
                      {field(
                        `${n} ${index + 1} (${n === 'calories' ? 'kcal' : 'g'}, optional)`,
                        draft.fields[`${index}.${n}`] ??
                          (ingredient.item.nutrients[n].value === null
                            ? ''
                            : String(ingredient.item.nutrients[n].value)),
                        (v) => {
                          const d = structuredClone(doc);
                          d.ingredients[index]!.item.nutrients[n] = {
                            value: v.trim() ? Number(v) : null,
                            source: v.trim() ? 'supplied' : 'unknown',
                          };
                          change({
                            ...draft,
                            document: d,
                            fields: { ...draft.fields, [`${index}.${n}`]: v },
                          });
                        },
                        true,
                      )}
                      <Text style={ui.copy}>{sources[ingredient.item.nutrients[n].source]}</Text>
                    </View>
                  ))}
                  <Action
                    label={`Mark ingredient ${index + 1} values as my estimates`}
                    secondary
                    disabled={disabled}
                    onPress={() => {
                      const d = structuredClone(doc);
                      for (const n of nutrients)
                        if (d.ingredients[index]!.item.nutrients[n].value !== null)
                          d.ingredients[index]!.item.nutrients[n].source = 'user_estimated';
                      update(d);
                    }}
                  />
                  <Action
                    label={`Remove ingredient ${index + 1}`}
                    secondary
                    disabled={disabled || doc.ingredients.length === 1}
                    onPress={() => {
                      const d = structuredClone(doc);
                      d.ingredients.splice(index, 1);
                      change({ ...draft, document: d, fields: {} });
                    }}
                  />
                </View>
              ))}
              <Action
                label="Add ingredient"
                secondary
                disabled={disabled || doc.ingredients.length >= 12}
                onPress={() =>
                  update({
                    ...doc,
                    ingredients: [...doc.ingredients, { item: blank(), amount: 1 }],
                  })
                }
              />
              {validLibraryDocument(doc) && (
                <LibrarySummary
                  item={{
                    id: draft.editingId ?? '11111111-1111-4111-8111-111111111111',
                    revision: draft.revision ?? 1,
                    document: doc,
                  }}
                  servings={1}
                  ingredients={false}
                />
              )}
              <Action
                label={draft.editingId ? 'Save new recipe version' : 'Save recipe'}
                disabled={disabled || stale || !validLibraryDocument(doc)}
                onPress={() =>
                  void submit({
                    operationId: operationId(),
                    kind: 'save',
                    libraryId: draft.editingId,
                    expectedRevision: draft.revision,
                    document: doc,
                  })
                }
              />
            </>
          )}
          {hasDraft && !draft.pending && (
            <Action
              label="Discard library draft"
              secondary
              disabled={busy || blocked}
              onPress={() => {
                change(emptyLibraryDraft());
                setView('list');
              }}
            />
          )}
        </>
      )}
    </Page>
  );
}
