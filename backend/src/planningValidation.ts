import { OnboardingError } from './onboardingError.js';

// Closed categories and numeric positions only: never Ajv messages, field values,
// additional-property names, athlete text, or provider bodies in diagnostics.
export const planChecks = [
  'week_schema',
  'week_dates',
  'blocked_response',
  'detail_schema',
  'detail_date',
  'session_count',
  'session_focus',
  'timing_required',
  'distance_required',
  'main_work',
  'quantity',
  'load',
  'rep_range',
  'rir',
  'distance_conversion',
  'interval_order',
  'interval_prescription',
  'goal_identity',
  'goal_evidence',
  'goal_coverage',
  'units',
] as const;
export type PlanCheck = (typeof planChecks)[number];
export class PlanValidationError extends OnboardingError {
  constructor(
    public check: PlanCheck,
    public position: number[] = [],
  ) {
    super(422, 'invalid_plan');
  }
}
export function invalidPlan(check: PlanCheck, ...position: number[]): never {
  throw new PlanValidationError(check, position);
}
export function atPlanPosition<T>(position: number[], fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof PlanValidationError) error.position = [...position, ...error.position];
    throw error;
  }
}
export function validationFailureCode(error: unknown): string | undefined {
  if (!(error instanceof PlanValidationError)) return;
  const position = error.position.slice(0, 4);
  if (
    !planChecks.includes(error.check) ||
    position.some((n) => !Number.isInteger(n) || n < 0 || n > 50000)
  )
    return 'invalid_plan';
  return ['invalid_plan', error.check, ...position].join(':');
}
