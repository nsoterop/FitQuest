// Invented evaluation athletes. Never copied from owner/production content.
import type { PlanningInput } from './planningDomain.js';
const dates = Array.from({ length: 7 }, (_, i) => `2026-10-${String(i + 5).padStart(2, '0')}`);
const make = (
  goals: string[],
  availability: string,
  equipment: string,
  experience: string,
): PlanningInput => ({
  kind: 'week',
  draftReview: true,
  qualityVersion: 2,
  preferredUnits: 'imperial',
  dates,
  profile: { age: 34, heightInches: 69, weightLb: 162 },
  summary: [
    { category: 'goals', origin: 'user_report', text: goals.join('; '), goals },
    { category: 'availability', origin: 'user_report', text: availability },
    { category: 'equipment', origin: 'user_report', text: equipment },
    { category: 'experience', origin: 'user_report', text: experience },
    { category: 'limitations', origin: 'user_report', text: 'No relevant limitations reported.' },
  ],
});
export const coachingCases = {
  distributed: make(
    ['Comfortable walking endurance', 'General strength', 'Acceleration technique'],
    'Monday, Wednesday and Saturday are available. I want short sessions spread between morning and evening, not one combined workout. Maximum 25 minutes per session and 40 minutes total per day. The exact activity timing is flexible.',
    'Safe level walking route; clear floor; firm wall; flat markers and suitable shoes; secure flat acceleration lane with ample space to slow down. No gym equipment or partner.',
    'Walks a mile three times weekly and does wall push-ups twice weekly. Has learned basic standing acceleration technique with an instructor and practiced controlled short accelerations. Prefers miles and pounds.',
  ),
  single: make(
    ['Build general strength', 'Maintain easy walking endurance'],
    'Tuesday and Friday are available, morning or evening. I prefer one session per day and have a maximum of 25 minutes total each day.',
    'Clear floor, firm wall, suitable shoes and safe level walking route; no raised support, weights, bands or gym.',
    'Beginner in strength training, comfortable with wall push-ups and bodyweight sit-to-stand. Walks 15 minutes twice weekly.',
  ),
  focused: make(
    ['Improve kneeling push-up strength'],
    'Monday and Thursday: one short session preferred, maximum 15 minutes per day. Other days unavailable.',
    'Firm wall and clear floor only. No weights, bench, partner or gym access.',
    'New to strength training; currently comfortable with six kneeling push-ups. No need for unrelated conditioning.',
  ),
};
export const distributedReport =
  'I want comfortable walking endurance, general strength and acceleration technique; walking is my priority. I walk a mile three times a week, do wall push-ups twice weekly, and have learned standing acceleration technique with an instructor and practiced controlled short accelerations. I can train Monday, Wednesday and Saturday. I want short sessions spread between morning and evening, not one combined workout. Maximum 25 minutes per session and 40 minutes total per day. Exact activity timing is flexible. I have a safe level walking route, clear floor, firm wall, flat markers, suitable shoes, and a secure flat acceleration lane with ample space to slow down. No gym equipment or partner. No relevant limitations to report. I prefer miles and pounds.';
