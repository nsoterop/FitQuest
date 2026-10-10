const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
import {
  validLibraryDocument,
  type LibraryState,
  type LibraryReceipt,
} from '../../../../backend/src/shared/foodContract';
import {
  validFoodDocument,
  validFoodCandidate,
  foodId,
  foodDate,
  type FoodOperation,
  type FoodState,
} from '../../../../backend/src/shared/foodContract';
export class FoodError extends Error {
  code: string;
  constructor(code: string) {
    super(foodMessage(code));
    this.code = code;
  }
}
export const foodMessage = (code: string) =>
  (
    ({
      food_recipe_manual:
        'Use the manual editor to correct a recipe entry while preserving its serving calculation.',
      library_changed: 'This saved meal changed. Reload and review the latest version.',
      library_full: 'Your library has reached its 200-item limit.',
      session_ended: 'Your session ended. Sign in again.',
      food_changed: 'This entry or day changed. Reload and review your edit before saving.',
      operation_conflict: 'This request changed. Check its saved status before continuing.',
      food_candidate_used: 'This reviewed entry was already saved. Reload your diary.',
      food_candidate_changed:
        'This review changed or expired. Use manual entry or request a new estimate.',
      food_context_expired:
        'This food conversation expired. Start a new entry or enter values manually.',
      food_context_limit: 'This conversation is full. Start a new entry or use manual entry.',
      future_food: 'Choose today or an earlier consumed date.',
      food_undo_expired: 'The 30-second Undo period has ended.',
      empty_food_day: 'Log food before marking the day complete.',
      food_source_changed:
        'A changed food or portion needs newly supplied values or a new estimate.',
      invalid_request: 'Check the date, time, portion and nutrient values.',
      adults_only: 'AI food interpretation is available for adults 18+.',
      account_ai_rate_limit:
        'Your daily AI request limit is reached. It resets at midnight UTC. Saved work and manual logging remain available.',
      account_ai_daily_limit:
        'Your daily AI allowance cannot cover this request. Try after midnight UTC or after pending requests finish. Saved work remains available.',
      account_ai_lifetime_limit:
        'Your account AI spending allowance cannot cover this request. Saved work and manual logging remain available.',
      budget_exhausted: 'The shared AI allowance is unavailable. You can still add food manually.',
      ai_disabled: 'AI interpretation is unavailable. Manual entry still works.',
      food_pending: 'An interpretation is still pending. Check its saved status.',
      invalid_food: 'The food response could not be read reliably. Nothing was logged.',
      refused: 'AI could not interpret this food. Manual entry is available.',
      incomplete: 'The food response was incomplete. Nothing was logged.',
      interrupted:
        'Interpretation was interrupted. A new explicit request may incur another AI charge.',
      provider_error: 'Interpretation failed. A new explicit request may incur another AI charge.',
      rate_limit: 'Please try again later. Manual entry remains available.',
    }) as Record<string, string>
  )[code] ?? 'The result could not be confirmed. Check saved status before trying again.';
function validOperation(v: unknown): v is FoodOperation {
  return (
    isRecord(v) &&
    foodId(v.id) &&
    typeof v.status === 'string' &&
    ['pending', 'completed', 'failed'].includes(v.status) &&
    (v.error === null || typeof v.error === 'string') &&
    (v.candidate === null || validFoodCandidate(v.candidate)) &&
    (v.entryId === null || foodId(v.entryId))
  );
}
function validState(v: unknown): v is FoodState {
  return (
    isRecord(v) &&
    foodDate(v.today) &&
    Array.isArray(v.dates) &&
    v.dates.length === 7 &&
    v.dates.every(foodDate) &&
    Array.isArray(v.days) &&
    v.days.every(
      (d: unknown) =>
        isRecord(d) &&
        foodDate(d.date) &&
        Number.isInteger(d.revision) &&
        typeof d.complete === 'boolean',
    ) &&
    Array.isArray(v.entries) &&
    v.entries.every(
      (e: unknown) =>
        isRecord(e) &&
        foodId(e.id) &&
        Number.isInteger(e.revision) &&
        typeof e.revision === 'number' &&
        e.revision > 0 &&
        validFoodDocument(e.document) &&
        typeof e.createdAt === 'string' &&
        typeof e.updatedAt === 'string' &&
        (e.deletedAt === null || typeof e.deletedAt === 'string') &&
        (e.undoUntil === null || typeof e.undoUntil === 'string'),
    )
  );
}
export async function foodRequest<T extends FoodState | FoodOperation>(
  path: string,
  body: unknown,
  token: string,
  signal: AbortSignal,
): Promise<T> {
  try {
    const base = new URL(process.env.EXPO_PUBLIC_API_URL ?? '');
    if (base.protocol !== 'https:' || base.username || base.password || !token || signal.aborted)
      throw Error();
    const url = new URL(`${base.pathname.replace(/\/$/, '')}/food${path}`, base);
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (signal.aborted) throw Error();
    if (response.status === 401) throw new FoodError('session_ended');
    const v: unknown = await response.json();
    if (response.status !== 200)
      throw new FoodError(isRecord(v) && typeof v.code === 'string' ? v.code : 'unavailable');
    if (signal.aborted || !(path.startsWith('?') ? validState(v) : validOperation(v)))
      throw Error();
    return v as T;
  } catch (e) {
    if (e instanceof FoodError) throw e;
    throw new FoodError('unavailable');
  }
}

export async function libraryRequest<T extends LibraryState | LibraryReceipt>(
  path: string,
  body: unknown,
  token: string,
  signal: AbortSignal,
): Promise<T> {
  try {
    const base = new URL(process.env.EXPO_PUBLIC_API_URL ?? '');
    if (base.protocol !== 'https:' || base.username || base.password || !token || signal.aborted)
      throw Error();
    const url = new URL(`${base.pathname.replace(/\/$/, '')}/food-library${path}`, base);
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (signal.aborted) throw Error();
    if (response.status === 401) throw new FoodError('session_ended');
    const v: unknown = await response.json();
    if (response.status !== 200)
      throw new FoodError(isRecord(v) && typeof v.code === 'string' ? v.code : 'unavailable');
    if (
      signal.aborted ||
      !(path === ''
        ? isRecord(v) &&
          Array.isArray(v.items) &&
          v.items.every(
            (i: unknown) =>
              isRecord(i) &&
              foodId(i.id) &&
              Number.isInteger(i.revision) &&
              typeof i.revision === 'number' &&
              i.revision > 0 &&
              validLibraryDocument(i.document),
          )
        : isRecord(v) &&
          foodId(v.id) &&
          foodId(v.libraryId) &&
          (v.entryId === null || foodId(v.entryId)))
    )
      throw Error();
    return v as T;
  } catch (e) {
    if (e instanceof FoodError) throw e;
    throw new FoodError('unavailable');
  }
}
