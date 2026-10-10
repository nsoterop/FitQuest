import { isDeepStrictEqual } from 'node:util';
import { activity } from './activityCatalog.js';
import type { Detail, Outline, PlanningInput } from './planningDomain.js';
import { OnboardingError } from './onboardingError.js';
type Review = NonNullable<PlanningInput['review']>;
type Slot = { date: string; session: number };
type Row = Slot & { index: number; id: string };
export type ProtectionLevel = 'activities' | 'outline';
export type Protections = {
  days: string[];
  sessions: Slot[];
  activities: Row[];
  unresolved: boolean;
};
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[-–]/g, ' ')
    .replace(/\b(push|pull) ups\b/g, '$1 up')
    .replace(/\s+/g, ' ')
    .trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ordinal = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];
const verbs =
  'change|edit|alter|shorten|halve|reduce|increase|split|replace|remove|move|swap|add|redistribute|combine';
// A deliberately small recognition boundary: explicit immutability, named saved
// targets, and direct edit instructions. Other prose is interpreted by the model;
// an explicit keep whose target cannot be resolved fails closed on changed work.
function clauses(text: string) {
  return text
    .split(
      new RegExp(
        `[;.!?\\n]+|(?:,\\s*(?:and\\s+)?|\\band\\s+|\\bbut\\s+)(?=(?:please\\s+)?(?:actually\\s+)?(?:keep|leave|preserve|do not|don't|${verbs})\\b)`,
        'i',
      ),
    )
    .map((s) => s.trim())
    .filter(Boolean);
}
function command(text: string) {
  const raw = normalize(text).replace(/^please /, ''),
    correction = /^(?:actually|instead|now)\b/.test(raw),
    s = raw.replace(/^(?:actually|instead|now)[, ]+/, '');
  const keep =
    /^(?:keep|leave|preserve) (.+?) (?:exactly )?(?:unchanged|the same|as (?:it|they) (?:is|are))$/.exec(
      s,
    ) ??
    /^(.+?) (?:stays?|remains?) unchanged$/.exec(s) ??
    /^(?:don't|do not|never) (?:change|edit|alter) (.+)$/.exec(s);
  if (keep) return { kind: 'keep' as const, target: keep[1]!, correction: false };
  const edit =
    new RegExp(`^(?:${verbs})\\b (.+)$`).exec(s) ??
    /^keep (.+?) by (?:shortening|halving|reducing|splitting|redistributing)\b/.exec(s);
  // Adding minutes to a session edits its duration, even with a session/workout
  // noun. A duration describing a new session ("a 10-minute session") does not.
  const addsDuration = /^add\b.*\b(?:minutes?|mins?|hours?)\s+(?:to|onto)\b/.test(s);
  return edit
    ? {
        kind: 'edit' as const,
        target: edit[1]!,
        correction,
        addition:
          /^add\b/.test(s) &&
          !addsDuration &&
          (!/\b(?:minutes?|mins?|hours?)\b/.test(s) || /\b(?:session|workout)\b/.test(s)),
      }
    : null;
}
function targets(text: string, review: Review, dates: string[]) {
  const named = dates.flatMap((date, i) => {
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' })
      .format(new Date(`${date}T12:00:00Z`))
      .toLowerCase();
    const match = new RegExp(
      `\\b(?:${escape(normalize(date))}|${day}(?:'s)?|(?:the )?${ordinal[i]} day)\\b`,
    ).exec(text);
    if (!match) return [];
    const timing =
      /^\s*(?:the )?(morning|midday|evening|first|second|third)\b/.exec(
        text.slice(match.index + match[0].length),
      )?.[1] ??
      /\b(morning|midday|evening|first|second|third)(?: session)?(?: on)?\s*$/.exec(
        text.slice(0, match.index),
      )?.[1];
    return [{ date, timing: timing ?? null }];
  });
  const whole = /\b(?:whole|entire) week\b|^everything$/.test(text);
  const allowed = named.length ? named : whole ? dates.map((date) => ({ date, timing: null })) : [];
  const rows = review.days.flatMap((d) =>
    d.sessions.flatMap((s, session) =>
      s.activities.map((a, index) => ({ date: d.date, session, index, id: a.id })),
    ),
  );
  const ids = new Set(
    rows
      .filter((row) => {
        const a = activity(row.id),
          names = [
            row.id,
            String(a['Exercise name']),
            ...String(a.Aliases ?? '').split(';'),
          ].filter(Boolean);
        return names.some((name) =>
          new RegExp(`\\b${escape(normalize(name.trim()))}s?\\b`).test(text),
        );
      })
      .map((r) => r.id),
  );
  const slots = review.days.flatMap((d) =>
    d.sessions.flatMap((s, session) =>
      allowed.some(
        (t) =>
          t.date === d.date &&
          (t.timing === null || t.timing === s.timing || t.timing === ordinal[session]),
      )
        ? [{ date: d.date, session }]
        : [],
    ),
  );
  return {
    additionDates: allowed.map((t) => t.date),
    days: allowed.filter((t) => t.timing === null).map((t) => t.date),
    slots,
    rows: rows.filter(
      (r) =>
        ids.has(r.id) &&
        (!allowed.length || slots.some((s) => s.date === r.date && s.session === r.session)),
    ),
    ids,
  };
}
const sameSlot = (a: Slot, b: Slot) => a.date === b.date && a.session === b.session;
const sameRow = (a: Row, b: Row) => sameSlot(a, b) && a.index === b.index;
function shortKeepAnswer(text: string, review: Review, dates: string[]) {
  // Match a complete named-target fragment, not a mention inside unrelated prose.
  // All labels come from the saved week/catalog; ambiguous matches stay unresolved.
  const phrase = normalize(text)
    .replace(/\.$/, '')
    .replace(/^i mean /, '')
    .replace(/^the /, '');
  const matches = new Map<string, ReturnType<typeof targets>>();
  const add = (labels: string[], key: string, target: ReturnType<typeof targets>) => {
    if (labels.some((label) => normalize(label) === phrase)) matches.set(key, target);
  };
  for (const [i, date] of dates.entries()) {
    const day = review.days.find((d) => d.date === date)!;
    const names = [
      date,
      new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
        new Date(`${date}T12:00:00Z`),
      ),
      `${ordinal[i]} day`,
    ];
    add(names, `day:${date}`, targets(normalize(date), review, dates));
    for (const [session, s] of day.sessions.entries()) {
      const slot = { date, session },
        timings = [s.timing, `${ordinal[session]} session`].filter((v): v is string => !!v);
      const labels = [
        ...timings,
        ...timings.map((t) => `${t} session`),
        review.outline.days.find((d) => d.date === date)!.sessions[session]!.focus,
      ];
      add(
        [...labels, ...names.flatMap((n) => labels.flatMap((l) => [`${n} ${l}`, `${l} on ${n}`]))],
        `session:${date}:${session}`,
        { additionDates: [], days: [], slots: [slot], rows: [], ids: new Set() },
      );
      for (const [index, a] of s.activities.entries()) {
        const catalog = activity(a.id),
          exerciseNames = [
            a.id,
            String(catalog['Exercise name']),
            ...String(catalog.Aliases ?? '').split(';'),
          ]
            .map((s) => s.trim())
            .filter(Boolean);
        if (exerciseNames.some((name) => /\bwalking\b/i.test(name)))
          exerciseNames.push('walk', 'walking');
        const qualified = [...names, ...names.flatMap((n) => timings.map((t) => `${n} ${t}`))];
        add(
          [
            ...exerciseNames,
            ...qualified.flatMap((n) =>
              exerciseNames.flatMap((e) => [`${n} ${e}`, `${e} on ${n}`]),
            ),
          ],
          `row:${date}:${session}:${index}`,
          {
            additionDates: [],
            days: [],
            slots: [],
            rows: [{ ...slot, index, id: a.id }],
            ids: new Set([a.id]),
          },
        );
      }
    }
  }
  return matches.size === 1 ? [...matches.values()][0]! : null;
}
export function reviewProtections(
  review: Review,
  dates: string[],
  level: ProtectionLevel = 'activities',
): Protections {
  const days = new Set<string>();
  let sessions: Slot[] = [],
    activities: Row[] = [];
  const unknownTargets = new Set<string>(),
    pendingRemainders = new Set<string>();
  const prior = review.context?.feedback.split('\n').filter(Boolean) ?? [];
  for (const [turn, text] of [...prior, review.feedback].entries()) {
    const commands = clauses(text)
      .map(command)
      .filter((c) => c !== null);
    const editCommands = commands.filter((c) => c.kind === 'edit');
    const edits = editCommands.map((c) => targets(c.target, review, dates));
    const remainder = (text: string) =>
      /^(?:all )?(?:the )?(?:other|remaining) (?:strength )?(?:exercises|activities|work)$|^(?:all )?(?:the )?rest(?: of (?:the )?(?:exercises|activities|work))?$/.test(
        text,
      ) ||
      (level === 'outline' &&
        /^(?:all )?(?:the )?(?:(?:other|remaining) (?:days|sessions)|rest of (?:the )?(?:week|days|sessions))$/.test(
          text,
        ));
    const keeps = commands.filter((c) => c.kind === 'keep');
    // One explicit, concrete keep answers one earlier unidentified keep. Replaying
    // the clarification history resolves that ambiguity without releasing any
    // established lock. Unrelated edits, vague replies and multiple outstanding
    // targets cannot identify which protection was intended and remain unresolved.
    if (unknownTargets.size === 1 && keeps.length === 1 && !remainder(keeps[0]!.target)) {
      const answer = targets(keeps[0]!.target, review, dates);
      if (answer.rows.length || answer.days.length || answer.slots.length) unknownTargets.clear();
    }
    // A short answer to the pending preservation question supplies a keep target,
    // never edit authority. Earlier saved short answers replay in request order.
    const keepQuestion =
      review.context &&
      /\b(?:which|what)\b.*\b(?:keep|preserve|unchanged|stay|leave)\b/.test(
        normalize(review.context.question),
      );
    const answer =
      unknownTargets.size === 1 &&
      commands.length === 0 &&
      review.context &&
      (turn < prior.length || keepQuestion)
        ? shortKeepAnswer(text, review, dates)
        : null;
    if (answer) {
      unknownTargets.clear();
      for (const date of answer.days) days.add(date);
      sessions.push(...answer.slots);
      activities.push(...answer.rows);
    }
    const keepOthers = (target: string) => {
      if (level === 'outline') {
        // Before exercises exist, the remainder is the complement of explicitly
        // edited dates/sessions. Additions release a date, never its saved sessions.
        const touched = new Set<string>(),
          changed: Slot[] = [];
        if (!edits.length) return false;
        for (const [i, edit] of edits.entries()) {
          const addition = editCommands[i]!.addition;
          const named = addition
            ? edit.additionDates
            : [...edit.days, ...edit.slots.map((s) => s.date)];
          if (!named.length) return false;
          named.forEach((date) => touched.add(date));
          if (!addition) changed.push(...edit.slots);
        }
        for (const day of review.days) {
          if (!touched.has(day.date)) days.add(day.date);
          for (const [session] of day.sessions.entries()) {
            const slot = { date: day.date, session };
            if (!changed.some((s) => sameSlot(s, slot))) sessions.push(slot);
          }
        }
        return true;
      }
      const changedRows = edits.flatMap((e) => e.rows);
      if (!changedRows.length) return false;
      const strength = /\bstrength\b/.test(target);
      for (const day of review.days)
        for (const [session, s] of day.sessions.entries())
          for (const [index, a] of s.activities.entries()) {
            const row = { date: day.date, session, index, id: a.id };
            if (
              (!strength || String(activity(a.id)['Activity type']).toLowerCase() === 'strength') &&
              !changedRows.some((r) => sameRow(r, row))
            )
              activities.push(row);
          }
      return true;
    };
    const unlock = (target: ReturnType<typeof targets>, addition = false) => {
      if (level === 'outline' && addition) {
        for (const date of target.additionDates)
          if (days.delete(date)) {
            sessions.push(
              ...review.days
                .find((d) => d.date === date)!
                .sessions.map((_, session) => ({ date, session })),
            );
          }
        return;
      }
      // A later explicit session edit may override an older whole-day keep only
      // for that session: the other original sessions retain independent locks.
      const wholeSlots = target.ids.size === 0 ? target.slots : [];
      const touched = sessions.filter(
        (s) => wholeSlots.some((t) => sameSlot(s, t)) || target.rows.some((r) => sameSlot(s, r)),
      );
      for (const slot of [...wholeSlots, ...target.rows]) days.delete(slot.date);
      if (target.ids.size === 0) for (const date of target.days) days.delete(date);
      // Replacing one named activity never unlocks its previously kept neighbours.
      for (const slot of touched)
        if (!wholeSlots.some((t) => sameSlot(slot, t))) {
          const session = review.days.find((d) => d.date === slot.date)!.sessions[slot.session]!;
          activities.push(
            ...session.activities.flatMap((a, index) =>
              target.rows.some((r) => sameRow(r, { ...slot, index, id: a.id }))
                ? []
                : [{ ...slot, index, id: a.id }],
            ),
          );
        }
      sessions = sessions.filter((s) => !touched.some((t) => sameSlot(s, t)));
      activities = activities.filter(
        (r) => !target.rows.some((t) => sameRow(r, t)) && !wholeSlots.some((s) => sameSlot(r, s)),
      );
    };
    // Current edits can release older keeps, never a conflicting keep in the same
    // utterance. Only an explicit correction marker can supersede that current keep.
    for (const [i, edit] of edits.entries()) unlock(edit, editCommands[i]!.addition);
    for (const target of pendingRemainders)
      if (keepOthers(target)) pendingRemainders.delete(target);
    for (const c of commands) {
      const target = targets(c.target, review, dates);
      if (c.kind === 'edit') {
        if (c.correction) unlock(target, c.addition);
        continue;
      }
      if (remainder(c.target)) {
        if (!keepOthers(c.target)) pendingRemainders.add(c.target);
      } else if (target.rows.length) activities.push(...target.rows);
      else if (target.days.length || target.slots.length) {
        for (const date of target.days) days.add(date);
        sessions.push(...target.slots);
      } else unknownTargets.add(c.target);
    }
  }
  return {
    days: [...days],
    sessions: sessions.filter((s, i, a) => a.findIndex((x) => sameSlot(x, s)) === i),
    activities: activities.filter((s, i, a) => a.findIndex((x) => sameRow(x, s)) === i),
    unresolved: unknownTargets.size > 0 || pendingRemainders.size > 0,
  };
}
export function checkReviewProtections(
  review: Review,
  dates: string[],
  details: Detail[],
  outline: Outline,
  level: ProtectionLevel = 'activities',
) {
  const locks = reviewProtections(review, dates, level),
    fail = () => {
      throw new OnboardingError(422, 'saved_day_changed');
    };
  if (
    locks.unresolved &&
    (!isDeepStrictEqual(
      review.days.map((d) => d.sessions),
      details.map((d) => d.sessions),
    ) ||
      !isDeepStrictEqual(review.outline.days, outline.days))
  )
    fail();
  for (const date of dates) {
    const old = review.days.find((d) => d.date === date)!,
      next = details.find((d) => d.date === date)!,
      oldOutline = review.outline.days.find((d) => d.date === date)!,
      nextOutline = outline.days.find((d) => d.date === date)!;
    if (
      locks.days.includes(date) &&
      (!isDeepStrictEqual(old.sessions, next.sessions) ||
        !isDeepStrictEqual(oldOutline, nextOutline))
    )
      fail();
    let after = -1;
    for (const slot of locks.sessions
      .filter((s) => s.date === date)
      .sort((a, b) => a.session - b.session)) {
      const found = next.sessions.findIndex(
        (s, i) =>
          i > after &&
          isDeepStrictEqual(s, old.sessions[slot.session]) &&
          isDeepStrictEqual(nextOutline.sessions[i], oldOutline.sessions[slot.session]),
      );
      if (found < 0) fail();
      after = found;
    }
    // Activity keeps survive legitimate session redistribution, preserving exact
    // prescriptions and relative order. Extra copies of kept IDs cannot add work.
    const rows = locks.activities
        .filter((r) => r.date === date)
        .sort((a, b) => a.session - b.session || a.index - b.index),
      flat = next.sessions.flatMap((s) => s.activities);
    after = -1;
    for (const row of rows) {
      const original = old.sessions[row.session]!.activities[row.index]!;
      const found = flat.findIndex((a, i) => i > after && isDeepStrictEqual(a, original));
      if (found < 0) fail();
      after = found;
    }
    for (const id of new Set(rows.map((r) => r.id)))
      if (
        flat.filter((a) => a.id === id).length !==
        old.sessions.flatMap((s) => s.activities).filter((a) => a.id === id).length
      )
        fail();
  }
}
