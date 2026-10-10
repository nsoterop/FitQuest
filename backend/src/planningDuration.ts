import type { Detail } from './planningDomain.js';
import type { TrainingSummary } from './trainingSummary.js';
import { OnboardingError } from './onboardingError.js';

// A floor from measurable work/rest, not a pace estimate for distances or reps.
export function minimumMinutes(session: Detail['sessions'][number]) {
  return (
    session.activities.reduce(
      (seconds, a) =>
        seconds +
        (a.measure === 'seconds' ? a.sets * a.amount * (a.side === 'each' ? 2 : 1) : 0) +
        Math.max(0, a.sets - 1) * a.restSeconds,
      0,
    ) / 60
  );
}
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function applies(qualifier: string, date?: string) {
  if (!qualifier) return true;
  if (!date) return false;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (qualifier === 'weekdays') return weekday >= 1 && weekday <= 5;
  if (qualifier === 'weekends') return weekday === 0 || weekday === 6;
  return qualifier === dayNames[weekday] || qualifier === date;
}
export function explicitTimeLimits(summary: TrainingSummary, date?: string) {
  const caps: { session: number[]; day: number[] } = { session: [], day: [] };
  for (const fact of summary.filter(
    (f) => f.category === 'availability' && f.origin !== 'unknown',
  )) {
    // Only independently scoped, explicit caps are machine-enforced. Other prose
    // remains in the model input; never strip qualifications into a global cap.
    for (const group of fact.text.toLowerCase().split(/[;.!?]/)) {
      const parsed = group
        .split(/,|\band\b/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((clause) => {
          if (
            /\b(?:at least|minimum|prefer|want|aim|ideally|usually|typically|about|around)\b/.test(
              clause,
            )
          )
            return 'not-a-cap';
          return /^(?:(?:i |we )?(?:can (?:train|exercise)(?: for)?|have|am available for|are available for)|up to|at most|no more than|maximum|max(?:imum)? of|limit(?:ed)? to)?\s*(?:(?:up to|at most|no more than|a maximum of)\s+)?(\d{1,3})\s*(?:minutes?|mins?)\s*(?:maximum\s*)?(?:per|each|a|total\s*(?:per)?)\s*(session|day)(?:\s+(?:on\s+)?(weekdays|weekends|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{4}-\d{2}-\d{2}))?$/.exec(
            clause,
          );
        });
      // A trailing qualification ("..., for walking" or "and only on weekdays")
      // must not disappear merely because it is separated by punctuation.
      if (parsed.some((match) => match === null)) continue;
      for (const match of parsed)
        if (match && match !== 'not-a-cap' && applies(match[3] ?? '', date))
          caps[match[2] as 'session' | 'day'].push(Number(match[1]));
    }
  }
  return {
    session: caps.session.length ? Math.min(...caps.session) : null,
    day: caps.day.length ? Math.min(...caps.day) : null,
  };
}
export function checkDurations(details: Detail[], summary: TrainingSummary) {
  for (const day of details) {
    const limits = explicitTimeLimits(summary, day.date);
    let total = 0;
    for (const session of day.sessions) {
      const minutes = session.estimatedMinutes;
      if (minutes === undefined) continue; // Unchanged legacy prescriptions stay readable.
      if (
        minutes < minimumMinutes(session) ||
        (limits.session !== null && minutes > limits.session)
      )
        throw new OnboardingError(422, 'time_limit');
      total += minutes;
    }
    if (limits.day !== null && total > limits.day) throw new OnboardingError(422, 'time_limit');
  }
}
