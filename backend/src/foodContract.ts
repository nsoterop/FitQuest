// Shared display/entry contract. Numeric nutrients are per recorded base portion.
export const nutrients = ['calories', 'protein', 'carbs', 'fat'] as const;
export type Nutrient = (typeof nutrients)[number];
export type FoodValue = {
  value: number | null;
  source: 'supplied' | 'estimated' | 'user_estimated' | 'unknown';
};
export type FoodItem = {
  name: string;
  portion: string;
  quantity: number | null;
  unit: string | null;
  nutrients: Record<Nutrient, FoodValue>;
};
export type FoodDocument = {
  recipe?: { id: string; revision: number; yield: number; amounts: number[] };
  name: string;
  meal: string;
  date: string;
  time: string | null;
  timeZone: string;
  servings: number;
  items: FoodItem[];
  assumptions: string[];
};
export type FoodCandidate = {
  intent: 'consumed' | 'planned' | 'unclear';
  question: string | null;
  document: FoodDocument | null;
};
export type FoodEntry = {
  id: string;
  revision: number;
  document: FoodDocument;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  undoUntil: string | null;
};
export type FoodDay = { date: string; revision: number; complete: boolean };
export type FoodState = { entries: FoodEntry[]; days: FoodDay[]; dates: string[]; today: string };
export type FoodCommand = { operationId: string } & (
  | {
      kind: 'interpret';
      message: string;
      date: string;
      timeZone: string;
      previousOperation: string | null;
      entryId: string | null;
      expectedRevision: number | null;
    }
  | {
      kind: 'save';
      document: FoodDocument;
      entryId: string | null;
      expectedRevision: number | null;
      candidateOperation: string | null;
      confirmConsumed: true;
    }
  | { kind: 'delete' | 'undo'; entryId: string; expectedRevision: number }
  | {
      kind: 'complete';
      date: string;
      timeZone: string;
      expectedRevision: number;
      complete: boolean;
    }
);
export type FoodOperation = {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  error: string | null;
  candidate: FoodCandidate | null;
  entryId: string | null;
};
export const foodId = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function foodDate(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v + 'T12:00:00Z')) &&
    new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v &&
    v >= '2000-01-01'
  );
}
export function foodToday(zone: string, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function foodZone(v: unknown): v is string {
  try {
    return (
      typeof v === 'string' &&
      v.length <= 80 &&
      !!new Intl.DateTimeFormat('en', { timeZone: v }).format()
    );
  } catch {
    return false;
  }
}
export function shiftFoodDate(date: string, delta: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
export function foodWeek(date: string) {
  const start = shiftFoodDate(date, -((new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftFoodDate(start, i));
}
const text = (v: unknown, n: number) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= n;
const keys = (v: unknown, list: string[]) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === list.length &&
  Object.keys(v).every((k) => list.includes(k));
export function validFoodDocument(v: unknown): v is FoodDocument {
  if (
    !keys(v, [
      'name',
      'meal',
      'date',
      'time',
      'timeZone',
      'servings',
      'items',
      'assumptions',
      ...(v && typeof v === 'object' && 'recipe' in v ? ['recipe'] : []),
    ])
  )
    return false;
  const d = v as FoodDocument;
  return (
    (!d.recipe ||
      (keys(d.recipe, ['id', 'revision', 'yield', 'amounts']) &&
        foodId(d.recipe.id) &&
        Number.isInteger(d.recipe.revision) &&
        d.recipe.revision > 0 &&
        recipeAmount(d.recipe.yield) &&
        Array.isArray(d.recipe.amounts) &&
        Array.isArray(d.items) &&
        d.recipe.amounts.length === d.items.length &&
        d.recipe.amounts.every(recipeAmount))) &&
    text(d.name, 160) &&
    text(d.meal, 50) &&
    foodDate(d.date) &&
    foodZone(d.timeZone) &&
    (d.time === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(d.time)) &&
    Number.isFinite(d.servings) &&
    d.servings > 0 &&
    d.servings <= 100 &&
    Math.abs(Math.round(d.servings * 1000) - d.servings * 1000) < 1e-7 &&
    Array.isArray(d.items) &&
    d.items.length > 0 &&
    d.items.length <= 12 &&
    d.items.every(
      (i) =>
        keys(i, ['name', 'portion', 'quantity', 'unit', 'nutrients']) &&
        text(i.name, 160) &&
        text(i.portion, 250) &&
        (i.quantity === null ||
          (Number.isFinite(i.quantity) && i.quantity > 0 && i.quantity <= 100000)) &&
        (i.unit === null || text(i.unit, 50)) &&
        (i.quantity === null) === (i.unit === null) &&
        keys(i.nutrients, [...nutrients]) &&
        nutrients.every((n) => {
          const x = i.nutrients[n];
          return (
            keys(x, ['value', 'source']) &&
            (x.value === null
              ? x.source === 'unknown'
              : Number.isFinite(x.value) &&
                x.value >= 0 &&
                x.value <= (n === 'calories' ? 100000 : 10000) &&
                ['supplied', 'estimated', 'user_estimated'].includes(x.source) &&
                Math.abs(x.value * 1000 - Math.round(x.value * 1000)) < 1e-7)
          );
        }),
    ) &&
    Array.isArray(d.assumptions) &&
    d.assumptions.length <= 8 &&
    d.assumptions.every((a) => text(a, 500))
  );
}
export function validFoodCandidate(v: unknown): v is FoodCandidate {
  if (!keys(v, ['intent', 'question', 'document'])) return false;
  const c = v as FoodCandidate;
  return (
    ['consumed', 'planned', 'unclear'].includes(c.intent) &&
    (c.question === null || text(c.question, 600)) &&
    (c.document === null || validFoodDocument(c.document)) &&
    (c.document !== null || c.question !== null)
  );
}
const recipeAmount = (v: unknown) =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v > 0 &&
  v <= 100 &&
  Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-7;
// Sum exact integer base values before dividing by batch yield; round only for display.
export function foodTotal(docs: FoodDocument[], n: Nutrient) {
  let value = 0,
    unknown = 0,
    estimated = false;
  for (const d of docs) {
    let numerator = 0n;
    for (const [index, i] of d.items.entries()) {
      const v = i.nutrients[n];
      if (v.value === null) unknown++;
      else {
        numerator +=
          BigInt(Math.round(v.value * 1000)) *
          BigInt(Math.round(d.servings * 1000)) *
          BigInt(Math.round((d.recipe?.amounts[index] ?? 1) * 1000));
        estimated ||= v.source === 'estimated' || v.source === 'user_estimated';
      }
    }
    value += Number(numerator) / (1e6 * Math.round((d.recipe?.yield ?? 1) * 1000));
  }
  return { value, unknown, estimated, hasEntries: docs.length > 0 };
}
export function foodItemTotal(d: FoodDocument, index: number, n: Nutrient) {
  return foodTotal(
    [
      {
        ...d,
        items: [d.items[index]!],
        ...(d.recipe ? { recipe: { ...d.recipe, amounts: [d.recipe.amounts[index]!] } } : {}),
      },
    ],
    n,
  );
}
export function foodAverage(state: FoodState, n: Nutrient) {
  const totals = state.dates
    .filter((d) => d <= state.today && state.days.some((x) => x.date === d && x.complete))
    .map((d) =>
      foodTotal(
        state.entries.filter((e) => !e.deletedAt && e.document.date === d).map((e) => e.document),
        n,
      ),
    )
    .filter((x) => x.hasEntries && !x.unknown);
  return {
    value: totals.length ? totals.reduce((a, x) => a + x.value, 0) / totals.length : null,
    days: totals.length,
    estimated: totals.some((x) => x.estimated),
  };
}

export type LibraryDocument = {
  kind: 'meal' | 'recipe';
  name: string;
  meal: string;
  yield: number;
  defaultServings: number;
  ingredients: { item: FoodItem; amount: number }[];
  assumptions: string[];
};
export type LibraryItem = { id: string; revision: number; document: LibraryDocument };
export type LibraryState = { items: LibraryItem[] };
export type LibraryReceipt = { id: string; libraryId: string; entryId: string | null };
export type LibraryCommand = { operationId: string } & (
  | { kind: 'saveEntry'; entryId: string; expectedRevision: number }
  | {
      kind: 'save';
      libraryId: string | null;
      expectedRevision: number | null;
      document: LibraryDocument;
    }
  | {
      kind: 'log';
      libraryId: string;
      expectedRevision: number;
      servings: number;
      date: string;
      time: string | null;
      timeZone: string;
      confirmConsumed: true;
    }
);
export const amount = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v > 0 &&
  v <= 100 &&
  Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-7;
const exact = (v: unknown, fields: string[]) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === fields.length &&
  Object.keys(v).every((k) => fields.includes(k));
export function validLibraryDocument(v: unknown): v is LibraryDocument {
  if (!exact(v, ['kind', 'name', 'meal', 'yield', 'defaultServings', 'ingredients', 'assumptions']))
    return false;
  const d = v as LibraryDocument;
  return (
    ['meal', 'recipe'].includes(d.kind) &&
    amount(d.yield) &&
    amount(d.defaultServings) &&
    Array.isArray(d.ingredients) &&
    d.ingredients.every((i) => exact(i, ['item', 'amount']) && amount(i.amount)) &&
    validFoodDocument({
      name: d.name,
      meal: d.meal,
      date: '2026-01-01',
      time: null,
      timeZone: 'UTC',
      servings: 1,
      items: d.ingredients.map((i) => i.item),
      assumptions: d.assumptions,
    })
  );
}
export function validLibraryCommand(v: unknown): v is LibraryCommand {
  if (!v || typeof v !== 'object') return false;
  const c = v as LibraryCommand;
  if (!foodId(c.operationId)) return false;
  const rev = (r: unknown) => Number.isInteger(r) && Number(r) > 0;
  if (c.kind === 'saveEntry')
    return (
      exact(c, ['operationId', 'kind', 'entryId', 'expectedRevision']) &&
      foodId(c.entryId) &&
      rev(c.expectedRevision)
    );
  if (c.kind === 'save')
    return (
      exact(c, ['operationId', 'kind', 'libraryId', 'expectedRevision', 'document']) &&
      (c.libraryId === null
        ? c.expectedRevision === null
        : foodId(c.libraryId) && rev(c.expectedRevision)) &&
      validLibraryDocument(c.document)
    );
  return (
    c.kind === 'log' &&
    exact(c, [
      'operationId',
      'kind',
      'libraryId',
      'expectedRevision',
      'servings',
      'date',
      'time',
      'timeZone',
      'confirmConsumed',
    ]) &&
    foodId(c.libraryId) &&
    rev(c.expectedRevision) &&
    amount(c.servings) &&
    foodDate(c.date) &&
    foodZone(c.timeZone) &&
    (c.time === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(c.time)) &&
    c.confirmConsumed === true
  );
}
export function libraryFromEntry(d: FoodDocument): LibraryDocument {
  return {
    kind: 'meal',
    name: d.name,
    meal: d.meal,
    yield: d.recipe?.yield ?? 1,
    defaultServings: d.servings,
    ingredients: d.items.map((item, i) => ({
      item: structuredClone(item),
      amount: d.recipe?.amounts[i] ?? 1,
    })),
    assumptions: [...d.assumptions],
  };
}
export function libraryFood(
  item: LibraryItem,
  servings: number,
  date: string,
  time: string | null,
  timeZone: string,
): FoodDocument {
  const d = item.document;
  return {
    name: d.name,
    meal: d.meal,
    date,
    time,
    timeZone,
    servings,
    items: d.ingredients.map((i) => structuredClone(i.item)),
    assumptions: [...d.assumptions],
    recipe: {
      id: item.id,
      revision: item.revision,
      yield: d.yield,
      amounts: d.ingredients.map((i) => i.amount),
    },
  };
}
