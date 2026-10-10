import { reserveAI } from '../../ai/allowance.js';
import { checkedIntake } from './fixedIntake.js';
import { safeDiagnostic, type ProviderDiagnostic } from '../../ai/providerDiagnostics.js';
import {
  retainTrainingSummary,
  recoveryPlanId,
  checkTimeZone,
} from '../planning/trainingSummary.js';
import { informationCoverage } from '../planning/planningReadiness.js';
import { checkedSummary, assertRecoveryCurrent } from '../planning/trainingSummary.js';
import {
  readyToPlan,
  recapTopic,
  type RecoveryRequest,
  acceptsRecap,
  completeTopic,
  completionPendingReply,
} from './onboardingDomain.js';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Account } from '../account/auth.js';
import {
  bounded,
  commandDigest,
  disclosureVersion,
  emptyContext,
  limits,
  OnboardingError,
  type Command,
  type Context,
  type Item,
  type ModelInput,
} from './onboardingDomain.js';
import {
  minimizeModelInput,
  promptVersion,
  schemaVersion,
  type OnboardingProvider,
} from '../../ai/onboardingProvider.js';

export type Turn = {
  id: string;
  sequence: number;
  message: string;
  reply: string | null;
  questionTopic: string | null;
  state: 'pending' | 'completed' | 'failed';
  error: string | null;
};
export type Conversation = {
  id: string;
  revision: number;
  state: 'collecting' | 'confirmed';
  confirmedRevision: number | null;
  confirmableRevision?: number | null;
  context: Context;
  turns: Turn[];
  profileChanged: boolean;
};
export type Claim = {
  conversation: Conversation;
  work?: {
    attempt: string;
    turnId: string;
    revision: number;
    profileVersion: string;
    body: string;
    sources: Record<string, string>;
  };
};

export function completedConversation(conversation: Conversation) {
  const last = conversation.turns.at(-1);
  return (
    conversation.state === 'confirmed' ||
    (last?.state === 'completed' && last.questionTopic === completeTopic)
  );
}

function sameRecovery(saved: RecoveryRequest | undefined, request: RecoveryRequest) {
  return (
    saved?.planId.toLowerCase() === request.planId.toLowerCase() &&
    saved.summaryRevision === request.summaryRevision &&
    saved.target === request.target
  );
}
export function postgresOnboardingStore(pool: Pool) {
  async function transaction<T>(
    account: Account,
    operation: (c: PoolClient) => Promise<T>,
    verifySession = true,
  ): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('fitquest.user_id',$1,true)", [account.userId]);
      if (
        verifySession &&
        !(
          await c.query('SELECT fitquest.onboarding_session_guard($1,$2) AS active', [
            account.sessionId,
            account.userId,
          ])
        ).rows[0]?.active
      )
        throw new OnboardingError(401, 'session_ended');
      // Same lock order as planning: account, then conversation/summary/profile rows.
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [account.userId]);
      const result = await operation(c);
      await c.query('COMMIT');
      return result;
    } catch (error) {
      await c.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      c.release();
    }
  }
  async function profile(c: PoolClient, account: Account) {
    const row = (
      await c.query(
        'SELECT first_name,last_name,age,height_inches,weight_lb,gender,updated_at::text AS version FROM fitquest.profiles WHERE user_id=$1 FOR SHARE',
        [account.userId],
      )
    ).rows[0];
    if (!row) throw new OnboardingError(409, 'profile_required');
    return row;
  }

  async function lock(c: PoolClient, account: Account, id: string) {
    const row = (
      await c.query(
        'SELECT * FROM fitquest.onboarding_conversations WHERE user_id=$1 AND id=$2 FOR UPDATE',
        [account.userId, id],
      )
    ).rows[0];
    if (!row) throw new OnboardingError(404, 'not_found');
    return row;
  }
  async function recover(c: PoolClient, account: Account, id: string) {
    // A crashed process needs no queue: resume/retry turns expired leases into retryable failures.
    const expired = await c.query(
      `UPDATE fitquest.onboarding_turns SET state='failed',error_code='interrupted'
      WHERE user_id=$1 AND conversation_id=$2 AND state='pending' AND deadline<=now() RETURNING attempt_id`,
      [account.userId, id],
    );
    for (const row of expired.rows) {
      await c.query('SELECT fitquest.settle_onboarding($1,NULL)', [row.attempt_id]);
      await c.query(
        "UPDATE fitquest.onboarding_operations SET status='failed',error_code='interrupted' WHERE user_id=$1 AND conversation_id=$2 AND attempt_id=$3 AND status='pending'",
        [account.userId, id, row.attempt_id],
      );
    }
  }
  async function currentRecap(c: PoolClient, account: Account, id: string, number: number) {
    return (
      (
        await c.query(
          `SELECT 1 FROM fitquest.onboarding_operations o JOIN fitquest.onboarding_turns t
      ON t.user_id=o.user_id AND t.conversation_id=o.conversation_id AND t.id=o.turn_id
      WHERE o.user_id=$1 AND o.conversation_id=$2 AND o.result_revision=$3 AND o.status='completed'
      AND t.state='completed' AND t.question_topic=$4
      AND t.sequence=(SELECT max(sequence) FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2)
      AND NOT EXISTS(SELECT 1 FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2 AND state='pending') LIMIT 1`,
          [account.userId, id, number, recapTopic],
        )
      ).rowCount === 1
    );
  }
  async function snapshot(c: PoolClient, account: Account, id: string): Promise<Conversation> {
    const conv = await lock(c, account, id);
    const saved = (
      await c.query(
        'SELECT context,profile_version FROM fitquest.onboarding_context_revisions WHERE user_id=$1 AND conversation_id=$2 AND revision=$3',
        [account.userId, id, conv.revision],
      )
    ).rows[0];
    const p = await profile(c, account);
    const rows = await c.query(
      'SELECT id,sequence,message,reply,question_topic,state,error_code FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2 ORDER BY sequence',
      [account.userId, id],
    );
    const confirmable =
      conv.state === 'collecting' &&
      saved.profile_version === p.version &&
      readyToPlan(saved.context) &&
      (await currentRecap(c, account, id, conv.revision));
    return {
      id,
      revision: conv.revision,
      state: conv.state,
      confirmedRevision: conv.confirmed_revision,
      confirmableRevision: confirmable ? conv.revision : null,
      context: saved.context,
      profileChanged: saved.profile_version !== p.version,
      turns: rows.rows.map((x) => ({
        id: x.id,
        sequence: x.sequence,
        message: x.message,
        reply: x.reply,
        questionTopic: x.question_topic,
        state: x.state,
        error: x.error_code,
      })),
    };
  }
  async function revision(
    c: PoolClient,
    account: Account,
    id: string,
    number: number,
    context: Context,
    profileVersion: string,
  ) {
    bounded(context);
    await c.query(
      'INSERT INTO fitquest.onboarding_context_revisions(user_id,conversation_id,revision,context,profile_version) VALUES($1,$2,$3,$4,$5)',
      [account.userId, id, number, JSON.stringify(context), profileVersion],
    );
    await c.query(
      "UPDATE fitquest.onboarding_conversations SET revision=$3,state='collecting',confirmed_revision=NULL WHERE user_id=$1 AND id=$2",
      [account.userId, id, number],
    );
  }
  async function create(
    account: Account,
    timeZone?: string,
    recovery?: undefined,
    intakeVersion?: 1,
  ): Promise<Conversation>;
  async function create(
    account: Account,
    timeZone: string | undefined,
    recovery: RecoveryRequest,
  ): Promise<Conversation | { completedId: string }>;
  async function create(
    account: Account,
    timeZone = 'UTC',
    recovery?: RecoveryRequest,
    intakeVersion?: 1,
  ): Promise<Conversation | { completedId: string }> {
    checkTimeZone(timeZone);
    return transaction(account, async (c) => {
      const p = await profile(c, account);
      // Serializes create/resume for this verified account without a global lock.
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [account.userId]);
      if (recovery) {
        // A lost cleanup response can retry the original request. Only the exact
        // recovery-created plan at the current revision proves that it completed.
        const receipt = (
          await c.query(
            `SELECT s.source_conversation AS id FROM fitquest.training_summaries s
            JOIN fitquest.training_plans p ON p.user_id=s.user_id AND p.summary_revision=s.revision
            WHERE s.user_id=$1 AND s.revision=$2 AND p.id=$3 AND s.source_conversation IS NOT NULL`,
            [
              account.userId,
              recovery.summaryRevision + 1,
              recoveryPlanId(account.userId, recovery),
            ],
          )
        ).rows[0];
        if (receipt) return { completedId: receipt.id };
      }
      let id = (
        await c.query(
          'SELECT id FROM fitquest.onboarding_conversations WHERE user_id=$1 FOR UPDATE',
          [account.userId],
        )
      ).rows[0]?.id;
      if (id && completedConversation(await snapshot(c, account, id))) {
        const old = await lock(c, account, id),
          completed = await snapshot(c, account, id);
        if (recovery && !sameRecovery(completed.context.recovery, recovery))
          throw new OnboardingError(409, 'conversation_in_progress');
        await retainTrainingSummary(c, account, completed.context, id, old.time_zone);
        await c.query('DELETE FROM fitquest.onboarding_conversations WHERE user_id=$1 AND id=$2', [
          account.userId,
          id,
        ]);
        // Do not revalidate the old revision after this transaction advances it.
        if (recovery) return { completedId: id };
        id = undefined;
      }
      let seed: Context | undefined;
      if (recovery) {
        const saved = (
          await c.query(
            'SELECT revision,document,time_zone FROM fitquest.training_summaries WHERE user_id=$1 FOR UPDATE',
            [account.userId],
          )
        ).rows[0];
        const plan = (
          await c.query(
            'SELECT summary_revision,outline,outline_first,review_revision FROM fitquest.training_plans WHERE user_id=$1 AND id=$2',
            [account.userId, recovery.planId],
          )
        ).rows[0];
        if (!plan) throw new OnboardingError(404, 'not_found');
        if (
          !saved ||
          saved.revision !== recovery.summaryRevision ||
          plan.summary_revision !== saved.revision
        )
          throw new OnboardingError(409, 'summary_changed');
        const blocked =
          recovery.target === 'outline'
            ? plan.outline
            : (
                await c.query(
                  'SELECT detail FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2 AND date::text=$3',
                  [account.userId, recovery.planId, recovery.target],
                )
              ).rows[0]?.detail;
        const legacyFailure = (
          await c.query(
            "SELECT 1 FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND (target=$3 OR ($3='outline' AND target=$4)) AND error_code='summary_needs_correction'",
            [
              account.userId,
              recovery.planId,
              recovery.target,
              plan.outline_first ? `details:${plan.review_revision}` : 'outline',
            ],
          )
        ).rowCount;
        if (
          !blocked?.clarification &&
          !informationCoverage(blocked?.coverage ?? []) &&
          !legacyFailure
        )
          throw new OnboardingError(409, 'clarification_unavailable');
        if (id) {
          const active = await snapshot(c, account, id);
          if (!sameRecovery(active.context.recovery, recovery))
            throw new OnboardingError(409, 'conversation_in_progress');
        }
        seed = {
          ...emptyContext(),
          recovery,
          planningIssue: legacyFailure
            ? ['summary_needs_correction']
            : (blocked?.coverage ?? ['summary_needs_correction']),
          trainingSummary: checkedSummary(saved.document),
        };
        if (blocked?.clarification)
          seed.planningCheck = { status: 'question', ...blocked.clarification };
        // Only retained summary facts seed recovery. Deleted chat is never consulted.
        seed.items = saved.document.map(
          (fact: import('../planning/trainingSummary.js').SummaryFact, i: number) => ({
            id: `i${i + 1}`,
            topic: fact.category,
            value: fact.text,
            origin: fact.origin,
            review: 'unreviewed',
            source: `saved${i + 1}`,
            quote: fact.text,
            supersedes: null,
            recordedAt: new Date().toISOString(),
          }),
        );
        timeZone = saved.time_zone;
      }
      if (!id) {
        id = randomUUID();
        await c.query(
          'INSERT INTO fitquest.onboarding_conversations(user_id,id,disclosure_version,time_zone) VALUES($1,$2,$3,$4)',
          [
            account.userId,
            id,
            intakeVersion === 1 ? 'fixed-intake-v1' : disclosureVersion,
            timeZone,
          ],
        );
        const context = seed ?? {
          ...emptyContext(),
          ...(intakeVersion === 1 ? { intake: { version: 1 as const, answers: [] } } : {}),
        };
        for (const [topic, value] of context.intake
          ? []
          : [
              ['age', String(p.age)],
              ['height', `${p.height_inches} in`],
              ['weight', `${p.weight_lb} lb`],
              ['gender', p.gender],
            ]) {
          context.items.push({
            id: `i${context.items.length + 1}`,
            topic: topic!,
            value: value!,
            origin: 'profile',
            review: 'unreviewed',
            source: `profile:${topic}`,
            quote: value!,
            supersedes: null,
            recordedAt: new Date().toISOString(),
          });
        }
        await c.query(
          'INSERT INTO fitquest.onboarding_context_revisions(user_id,conversation_id,revision,context,profile_version) VALUES($1,$2,0,$3,$4)',
          [account.userId, id, JSON.stringify(context), p.version],
        );
      }
      await recover(c, account, id);
      return snapshot(c, account, id);
    });
  }
  return {
    create,
    async read(account: Account, id: string) {
      return transaction(account, async (c) => {
        await lock(c, account, id);
        await recover(c, account, id);
        return snapshot(c, account, id);
      });
    },
    async remove(account: Account, id: string) {
      return transaction(account, async (c) => {
        await c.query('DELETE FROM fitquest.onboarding_conversations WHERE user_id=$1 AND id=$2', [
          account.userId,
          id,
        ]);
      });
    },
    async removeCompleted(account: Account, id: string) {
      return transaction(account, async (c) => {
        // Lock and match this ID only; delayed cleanup must never target a new conversation.
        const row = (
          await c.query(
            'SELECT id,time_zone FROM fitquest.onboarding_conversations WHERE user_id=$1 AND id=$2 FOR UPDATE',
            [account.userId, id],
          )
        ).rows[0];
        if (!row) {
          if (
            (
              await c.query(
                'SELECT 1 FROM fitquest.training_summaries WHERE user_id=$1 AND source_conversation=$2',
                [account.userId, id],
              )
            ).rowCount
          )
            return true;
          // A manual deletion racing completion must not claim a saved summary exists.
          throw new OnboardingError(404, 'not_found');
        }
        const completed = await snapshot(c, account, id);
        if (!completedConversation(completed)) return false;
        await retainTrainingSummary(c, account, completed.context, id, row.time_zone);
        await c.query('DELETE FROM fitquest.onboarding_conversations WHERE user_id=$1 AND id=$2', [
          account.userId,
          id,
        ]);
        return true;
      });
    },
    async operation(account: Account, id: string, operationId: string) {
      return transaction(
        account,
        async (c) =>
          (
            await c.query(
              'SELECT id,result_revision AS revision,status,error_code AS code FROM fitquest.onboarding_operations WHERE user_id=$1 AND conversation_id=$2 AND id=$3',
              [account.userId, id, operationId],
            )
          ).rows[0],
      );
    },
    async claim(
      account: Account,
      id: string,
      command: Command,
      provider?: OnboardingProvider,
    ): Promise<Claim> {
      return transaction(account, async (c) => {
        const conv = await lock(c, account, id);
        await recover(c, account, id);
        const last = (
          await c.query(
            'SELECT state,question_topic FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2 ORDER BY sequence DESC LIMIT 1',
            [account.userId, id],
          )
        ).rows[0];
        if (
          conv.state === 'confirmed' ||
          (last?.state === 'completed' && last.question_topic === completeTopic)
        )
          return { conversation: await snapshot(c, account, id) };
        const prior = (
          await c.query(
            'SELECT digest FROM fitquest.onboarding_operations WHERE user_id=$1 AND conversation_id=$2 AND id=$3',
            [account.userId, id, command.operationId],
          )
        ).rows[0];
        if (prior) {
          if (prior.digest !== commandDigest(command))
            throw new OnboardingError(409, 'operation_conflict');
          return { conversation: await snapshot(c, account, id) };
        }
        if (command.expectedRevision !== conv.revision)
          throw new OnboardingError(409, 'revision_conflict');
        if (conv.revision >= limits.operations) throw new OnboardingError(422, 'storage_limit');
        const p = await profile(c, account);
        const old = (
          await c.query(
            'SELECT context,profile_version FROM fitquest.onboarding_context_revisions WHERE user_id=$1 AND conversation_id=$2 AND revision=$3',
            [account.userId, id, conv.revision],
          )
        ).rows[0];
        await assertRecoveryCurrent(c, account, old.context);
        const context: Context = structuredClone(old.context);
        const number = conv.revision + 1;
        const now = new Date().toISOString();
        let turnId: string | null = null;
        let work: Claim['work'];
        if (context.intake) {
          checkedIntake(context.intake);
          if (command.kind === 'edit') {
            const index = Number(command.topic.replace(/^intake:/, ''));
            if (
              command.itemId !== null ||
              !/^intake:[0-4]$/.test(command.topic) ||
              index > context.intake.answers.length
            )
              throw new OnboardingError(422, 'invalid_intake');
            context.intake.answers[index] = command.value;
            checkedIntake(context.intake);
            await revision(c, account, id, number, context, p.version);
          } else if (command.kind === 'confirm') {
            checkedIntake(context.intake, true);
            if (command.reviewedRevision !== conv.revision)
              throw new OnboardingError(409, 'review_changed');
            if (p.age < 18) throw new OnboardingError(403, 'adults_only');
            if (command.timeZone)
              await c.query(
                'UPDATE fitquest.onboarding_conversations SET time_zone=$3 WHERE user_id=$1 AND id=$2',
                [account.userId, id, checkTimeZone(command.timeZone)],
              );
            await revision(c, account, id, number, context, p.version);
            await c.query(
              "UPDATE fitquest.onboarding_conversations SET state='confirmed',confirmed_revision=$3 WHERE user_id=$1 AND id=$2",
              [account.userId, id, number],
            );
          } else throw new OnboardingError(422, 'invalid_intake');
        } else if (command.kind === 'confirm') {
          if (command.timeZone)
            await c.query(
              'UPDATE fitquest.onboarding_conversations SET time_zone=$3 WHERE user_id=$1 AND id=$2',
              [account.userId, id, checkTimeZone(command.timeZone)],
            );
          if (command.reviewedRevision !== conv.revision || old.profile_version !== p.version)
            throw new OnboardingError(409, 'review_changed');
          if (!readyToPlan(context) || !(await currentRecap(c, account, id, conv.revision)))
            throw new OnboardingError(409, 'clarification_required');
          // Persist the exact reviewed document, including origin and unknowns; no model call.
          await revision(c, account, id, number, context, p.version);
          await c.query(
            "UPDATE fitquest.onboarding_conversations SET state='confirmed',confirmed_revision=$3 WHERE user_id=$1 AND id=$2",
            [account.userId, id, command.reviewedRevision],
          );
          await c.query(
            "UPDATE fitquest.onboarding_turns SET state='failed',error_code='review_changed' WHERE user_id=$1 AND conversation_id=$2 AND state='pending'",
            [account.userId, id],
          );
          await c.query(
            "UPDATE fitquest.onboarding_operations SET status='failed',error_code='review_changed' WHERE user_id=$1 AND conversation_id=$2 AND status='pending'",
            [account.userId, id],
          );
        } else if (command.kind === 'edit' || command.kind === 'skip') {
          const source = `edit${number}`;
          delete context.planningCheck;
          delete context.trainingSummary; // Structured correction needs a fresh recap before retaining an AI summary.
          if (command.kind === 'edit') {
            const previous = context.items.find((x) => x.id === command.itemId);
            if (command.itemId && !previous) throw new OnboardingError(409, 'item_changed');
            if (previous) previous.review = 'disputed';
            const item: Item = {
              id: `i${context.items.length + 1}`,
              topic: command.topic,
              value: command.value,
              origin: 'user_report',
              review: 'confirmed',
              source,
              quote: command.value,
              supersedes: previous?.id ?? null,
              recordedAt: now,
            };
            context.items.push(item);
          } else {
            if (!context.skipped.includes(command.topic)) context.skipped.push(command.topic);
            context.items.push({
              id: `i${context.items.length + 1}`,
              topic: command.topic,
              value: 'Unknown — athlete skipped this topic.',
              origin: 'unknown',
              review: 'confirmed',
              source,
              quote: 'Skipped by athlete',
              supersedes: null,
              recordedAt: now,
            });
          }
          // Explicit edits reconcile current profile references but never mutate the profile itself.
          if (old.profile_version !== p.version) {
            for (const item of context.items.filter((x) => x.origin === 'profile')) {
              item.review = 'disputed';
            }
            context.limitations.push(
              'Profile changed; previous profile references remain disputed. Review current profile facts before planning.',
            );
          }
          await revision(c, account, id, number, context, p.version);
          await c.query(
            "UPDATE fitquest.onboarding_turns SET state='failed',error_code='review_changed' WHERE user_id=$1 AND conversation_id=$2 AND state='pending'",
            [account.userId, id],
          );
          await c.query(
            "UPDATE fitquest.onboarding_operations SET status='failed',error_code='review_changed' WHERE user_id=$1 AND conversation_id=$2 AND status='pending'",
            [account.userId, id],
          );
        } else {
          if (conv.revision >= limits.operations - 1)
            throw new OnboardingError(422, 'storage_limit');
          const pending = (
            await c.query(
              "SELECT id FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2 AND state='pending'",
              [account.userId, id],
            )
          ).rowCount;
          if (pending) throw new OnboardingError(409, 'turn_pending');
          const turns = (
            await c.query(
              'SELECT * FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2 ORDER BY sequence',
              [account.userId, id],
            )
          ).rows;
          const previous = turns.at(-1);
          const finishing =
            readyToPlan(context) &&
            command.kind === 'message' &&
            acceptsRecap(
              previous
                ? { state: previous.state, questionTopic: previous.question_topic }
                : undefined,
              command.text,
            ) &&
            (
              await c.query(
                "SELECT 1 FROM fitquest.onboarding_operations WHERE user_id=$1 AND conversation_id=$2 AND turn_id=$3 AND result_revision=$4 AND status='completed' LIMIT 1",
                [account.userId, id, previous.id, conv.revision],
              )
            ).rowCount === 1;
          let message: string;
          let sequence: number;
          if (command.kind === 'assess' && !context.recovery)
            throw new OnboardingError(409, 'clarification_unavailable');
          if (command.kind === 'assess' && turns.length)
            throw new OnboardingError(409, 'retry_unavailable');
          if (command.kind === 'message' || command.kind === 'assess') {
            if (turns.length >= limits.turns) throw new OnboardingError(422, 'storage_limit');
            turnId = randomUUID();
            message =
              command.kind === 'assess'
                ? 'Review my saved summary for the clarification needed to plan.'
                : command.text;
            sequence = turns.length + 1;
            context.items.push({
              id: `i${context.items.length + 1}`,
              topic: 'Athlete report',
              value: message,
              origin: 'user_report',
              review: 'unreviewed',
              source: `m${sequence}`,
              quote: message,
              supersedes: null,
              recordedAt: now,
            });
            await c.query(
              "INSERT INTO fitquest.onboarding_turns(user_id,conversation_id,id,sequence,message,state) VALUES($1,$2,$3,$4,$5,'failed')",
              [account.userId, id, turnId, sequence, message],
            );
            turns.push({ id: turnId, sequence, message, reply: null });
          } else {
            const turn = turns.find((x) => x.id === command.turnId);
            if (!turn || turn.state !== 'failed')
              throw new OnboardingError(409, 'retry_unavailable');
            turnId = turn.id;
          }
          if (old.profile_version !== p.version) throw new OnboardingError(409, 'profile_changed');
          await revision(c, account, id, number, context, p.version);
          let failure = 'ai_disabled';
          if (finishing) {
            if (command.timeZone)
              await c.query(
                'UPDATE fitquest.onboarding_conversations SET time_zone=$3 WHERE user_id=$1 AND id=$2',
                [account.userId, id, checkTimeZone(command.timeZone)],
              );
            // Persist conversational agreement, never confirm unseen structured items. No AI call.
            await c.query(
              "UPDATE fitquest.onboarding_turns SET state='completed',reply=$4,question_topic=$5,error_code=NULL WHERE user_id=$1 AND conversation_id=$2 AND id=$3",
              [account.userId, id, turnId, completionPendingReply, completeTopic],
            );
          } else if (command.kind === 'assess' && context.planningCheck?.status === 'question') {
            // The planner already supplied the exact question. Display once, without a paid re-ask.
            const check = context.planningCheck;
            await c.query(
              "UPDATE fitquest.onboarding_turns SET state='completed',reply=$4,question_topic='Planning clarification',error_code=NULL WHERE user_id=$1 AND conversation_id=$2 AND id=$3",
              [account.userId, id, turnId, `${check.reason}\n\n${check.question}`],
            );
          } else if (provider && p.age >= 18) {
            // Every raw report stays in context. Never truncate goals/restrictions to make a prompt fit.
            const sources: Record<string, string> = {};
            for (const t of turns) sources[`m${t.sequence}`] = t.message;
            for (const item of context.items)
              if (item.source.startsWith('edit') || item.source.startsWith('saved'))
                sources[item.source] = item.quote;
            const visible = structuredClone(context);
            visible.items = visible.items.filter((x) => x.origin !== 'profile');
            const input: ModelInput = {
              context: visible,
              sources,
              recent: turns
                .slice(-6)
                .flatMap((t) => [
                  { role: 'user' as const, text: t.message, source: `m${t.sequence}` },
                  ...(t.reply ? [{ role: 'assistant' as const, text: t.reply }] : []),
                ]),
              knownProfileFields: ['first name', 'last name', 'height', 'age', 'weight', 'gender'],
            };
            let prepared: ReturnType<OnboardingProvider['prepare']> | undefined;
            // A rejected change must not permanently enlarge the saved history. Roll back this
            // command so its draft can be shortened; prior transcript/review stays usable.
            try {
              prepared = provider.prepare(minimizeModelInput(input, [p.first_name, p.last_name]));
            } catch {
              throw new OnboardingError(422, 'context_limit');
            }
            if (prepared) {
              const attempt = randomUUID();
              await c.query(
                "INSERT INTO fitquest.onboarding_attempts(user_id,id,purpose,state,model,prompt_version,schema_version) VALUES($1,$2,$6,'not_dispatched',$3,$4,$5)",
                [
                  account.userId,
                  attempt,
                  provider.model,
                  promptVersion,
                  schemaVersion,
                  provider.purpose ?? 'app',
                ],
              );
              const allowanceFailure = await reserveAI(
                c,
                attempt,
                prepared.reserveMicro,
                provider.capMicro,
              );
              if (!allowanceFailure) {
                await c.query(
                  "UPDATE fitquest.onboarding_turns SET state='pending',error_code=NULL,attempt_id=$4,deadline=now()+interval '35 seconds' WHERE user_id=$1 AND conversation_id=$2 AND id=$3",
                  [account.userId, id, turnId, attempt],
                );
                work = {
                  attempt,
                  turnId: turnId!,
                  revision: number,
                  profileVersion: p.version,
                  body: prepared.body,
                  sources,
                };
              } else failure = allowanceFailure;
            }
          } else if (provider) failure = 'adults_only';
          if (
            !work &&
            !finishing &&
            !(command.kind === 'assess' && context.planningCheck?.status === 'question')
          )
            await c.query(
              'UPDATE fitquest.onboarding_turns SET error_code=$4 WHERE user_id=$1 AND conversation_id=$2 AND id=$3',
              [account.userId, id, turnId, failure],
            );
        }
        const turnStatus = turnId
          ? (
              await c.query(
                'SELECT state,error_code FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2 AND id=$3',
                [account.userId, id, turnId],
              )
            ).rows[0]
          : { state: 'completed', error_code: null };
        // Internal assessment uses the existing message operation category; its digest
        // retains kind=assess, so it cannot collide with an athlete message replay.
        await c.query(
          'INSERT INTO fitquest.onboarding_operations(user_id,conversation_id,id,digest,kind,turn_id,result_revision,attempt_id,status,error_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [
            account.userId,
            id,
            command.operationId,
            commandDigest(command),
            command.kind === 'assess' ? 'message' : command.kind,
            turnId,
            number,
            work?.attempt ?? null,
            turnStatus.state,
            turnStatus.error_code,
          ],
        );
        return { conversation: await snapshot(c, account, id), work };
      });
    },
    async settle(
      account: Account,
      attempt: string,
      cost: number | null,
      diagnostic?: ProviderDiagnostic,
    ) {
      // Separate from content commit; also works after sign-out/deletion/stale rejection.
      await transaction(
        account,
        (c) => c.query('SELECT fitquest.settle_onboarding($1,$2)', [attempt, cost]),
        false,
      );
      // Diagnostic storage must never roll back measured or uncertain accounting.
      if (diagnostic)
        try {
          await transaction(
            account,
            (c) =>
              c.query(
                'UPDATE fitquest.onboarding_attempts SET provider_diagnostic=$3 WHERE user_id=$1 AND id=$2',
                [account.userId, attempt, safeDiagnostic(diagnostic)],
              ),
            false,
          );
        } catch {
          /* Accounting is already committed; never log a raw database/provider error. */
        }
    },
    async finish(
      account: Account,
      id: string,
      work: NonNullable<Claim['work']>,
      context: Context | undefined,
      reply: string | undefined,
      failure: string | undefined,
      questionTopic?: string,
    ) {
      return transaction(account, async (c) => {
        const conv = await lock(c, account, id);
        const p = await profile(c, account);
        const turn = (
          await c.query(
            'SELECT * FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2 AND id=$3 FOR UPDATE',
            [account.userId, id, work.turnId],
          )
        ).rows[0];
        if (
          !turn ||
          turn.state !== 'pending' ||
          turn.attempt_id !== work.attempt ||
          conv.revision !== work.revision ||
          p.version !== work.profileVersion ||
          new Date(turn.deadline).getTime() <= Date.now()
        ) {
          if (turn?.attempt_id === work.attempt && turn.state === 'pending')
            await c.query(
              "UPDATE fitquest.onboarding_turns SET state='failed',error_code='stale_attempt' WHERE user_id=$1 AND conversation_id=$2 AND id=$3",
              [account.userId, id, work.turnId],
            );
          await c.query(
            "UPDATE fitquest.onboarding_operations SET status='failed',error_code='stale_attempt' WHERE user_id=$1 AND conversation_id=$2 AND attempt_id=$3 AND status='pending'",
            [account.userId, id, work.attempt],
          );
          return snapshot(c, account, id);
        }
        if (context?.recovery) {
          try {
            await assertRecoveryCurrent(c, account, context);
          } catch (e) {
            if (!(e instanceof OnboardingError) || e.code !== 'summary_changed') throw e;
            failure = 'summary_changed';
            context = undefined;
            reply = undefined;
          }
        }
        if (context && reply !== undefined) {
          await revision(c, account, id, conv.revision + 1, context, p.version);
          await c.query(
            "UPDATE fitquest.onboarding_turns SET state='completed',reply=$4,error_code=NULL,question_topic=$5 WHERE user_id=$1 AND conversation_id=$2 AND id=$3",
            [account.userId, id, work.turnId, reply, questionTopic ?? null],
          );
        } else
          await c.query(
            "UPDATE fitquest.onboarding_turns SET state='failed',error_code=$4 WHERE user_id=$1 AND conversation_id=$2 AND id=$3",
            [account.userId, id, work.turnId, failure ?? 'provider_error'],
          );
        await c.query(
          "UPDATE fitquest.onboarding_operations SET status=$4,error_code=$5,result_revision=$6 WHERE user_id=$1 AND conversation_id=$2 AND attempt_id=$3 AND status='pending'",
          [
            account.userId,
            id,
            work.attempt,
            context && reply !== undefined ? 'completed' : 'failed',
            failure ?? null,
            context && reply !== undefined ? conv.revision + 1 : conv.revision,
          ],
        );
        return snapshot(c, account, id);
      });
    },
  };
}
export type OnboardingStore = ReturnType<typeof postgresOnboardingStore>;
