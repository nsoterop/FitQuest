// Exact standing owner-only training-content deletion set. Never include journal or ledger tables.
// The release operator must positively identify the owner, lock/check fresh preservation evidence,
// and execute these statements in one transaction with constraints deferred.
export const trainingTestResetTables = [
  'plan_validation_diagnostics',
  'onboarding_operations',
  'onboarding_turns',
  'onboarding_context_revisions',
  'onboarding_conversations',
  'training_generations',
  'training_days',
  'training_plans',
  'training_summaries',
] as const;
export const trainingTestResetStatements = trainingTestResetTables.map(
  (table) => `DELETE FROM fitquest.${table} WHERE user_id=$1`,
);
export const journalPreservationTables = [
  'workout_journals',
  'workout_journal_operations',
] as const;
export const weightPreservationTables = ['body_weights', 'body_weight_operations'] as const;
