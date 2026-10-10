import type { FoodService } from './features/nutrition/food.js';
import type { FoodCommand } from './shared/foodContract.js';
import type { PlanningService } from './features/planning/planning.js';
import { storedSummarySchema as summarySchema } from './features/planning/trainingSummary.js';
import type { TrainingSummary } from './features/planning/trainingSummary.js';
import type { GenerationRequest } from './features/planning/planningStore.js';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Account, VerifyAccount } from './features/account/auth.js';
import type { ProfileInput, ProfileStore } from './features/account/profileStore.js';
import {
  commandSchema,
  idSchema,
  type OnboardingService,
} from './features/onboarding/onboarding.js';
import { OnboardingError, type Command } from './features/onboarding/onboardingDomain.js';

export function buildApp(
  logger: FastifyServerOptions['logger'] = false,
  options: {
    store?: ProfileStore;
    verifyAccount?: VerifyAccount;
    onboarding?: OnboardingService;
    planning?: PlanningService;
    weight?: import('./features/weight/weightStore.js').WeightStore;
    journal?: import('./features/journal/journalStore.js').JournalStore;
    library?: import('./features/nutrition/foodLibraryStore.js').FoodLibraryStore;
    food?: FoodService;
  } = {},
) {
  const app = Fastify({
    logger,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  const accounts = new WeakMap<object, Account>();

  const requireAccount: import('fastify').onRequestAsyncHookHandler = async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    let account: Account | null = null;
    try {
      if (match && options.verifyAccount) account = await options.verifyAccount(match[1]!);
      if (account && options.store && !(await options.store.sessionActive(account))) account = null;
    } catch {
      return reply.code(503).send({ message: 'Unable to verify your session. Please try again.' });
    }
    if (!account) {
      return reply.code(401).send({ message: 'Sign in to access your profile.' });
    }
    accounts.set(request, account);
  };

  app.get('/health', async () => ({ service: 'fitquest-api', status: 'ok' }));

  const textField = { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' };
  app.post<{ Body: ProfileInput }>(
    '/profile-intake',
    {
      logLevel: 'silent',
      bodyLimit: 4096,
      onRequest: requireAccount,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['firstName', 'lastName', 'height', 'age', 'weight', 'gender'],
          properties: {
            firstName: textField,
            lastName: textField,
            gender: textField,
            age: { type: 'integer', minimum: 1, maximum: 130 },
            height: {
              type: 'object',
              additionalProperties: false,
              required: ['value', 'unit'],
              properties: {
                value: { type: 'integer', minimum: 1, maximum: 120 },
                unit: { type: 'string', const: 'in' },
              },
            },
            weight: {
              type: 'object',
              additionalProperties: false,
              required: ['value', 'unit'],
              properties: {
                value: { type: 'number', exclusiveMinimum: 0, maximum: 1500 },
                unit: { type: 'string', const: 'lb' },
              },
            },
          },
        },
      },
      // Never echo parser errors or submitted values into responses or logs.
      errorHandler(error, _request, reply) {
        const status =
          error.statusCode && error.statusCode >= 400 && error.statusCode < 500
            ? error.statusCode
            : 500;
        return reply.code(status).send({
          message:
            status < 500
              ? 'Check all six fields and use inches and pounds.'
              : 'Unable to submit right now. Please try again.',
        });
      },
    },
    async (request, reply) => {
      try {
        if (!options.store) throw new Error('Profile storage unavailable.');
        await options.store.save(accounts.get(request)!, request.body);
        return { message: 'User Data Saved' };
      } catch {
        return reply.code(503).send({ message: 'Unable to save your profile. Please try again.' });
      }
    },
  );

  app.get(
    '/profile',
    {
      logLevel: 'silent',
      onRequest: requireAccount,
      errorHandler(_error, _request, reply) {
        return reply.code(503).send({ message: 'Unable to load your profile. Please try again.' });
      },
    },
    async (request, reply) => {
      try {
        if (!options.store) throw new Error('Profile storage unavailable.');
        return { profile: await options.store.read(accounts.get(request)!) };
      } catch {
        return reply.code(503).send({ message: 'Unable to load your profile. Please try again.' });
      }
    },
  );

  // Bound malformed/unauthenticated traffic too; bounded memory, no stored IP history.
  const onboardingRates = new Map<string, { until: number; count: number }>();
  const onboardingAccount: import('fastify').onRequestAsyncHookHandler = async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const now = Date.now();
    for (const [key, value] of onboardingRates) if (value.until <= now) onboardingRates.delete(key);
    let rate = onboardingRates.get(request.ip);
    if (!rate && onboardingRates.size < 1000) {
      rate = { until: now + 60000, count: 0 };
      onboardingRates.set(request.ip, rate);
    }
    if (!rate || ++rate.count > 120)
      return reply.code(429).send({ code: 'rate_limit', message: 'Please try again later.' });
    await requireAccount.call(app, request, reply);
  };
  const privateRoute = {
    logLevel: 'silent' as const,
    onRequest: onboardingAccount,
    bodyLimit: 8192,
    errorHandler(
      error: import('fastify').FastifyError,
      _request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
    ) {
      const status =
        error instanceof OnboardingError
          ? error.status
          : error.statusCode && error.statusCode >= 400 && error.statusCode < 500
            ? error.statusCode
            : 503;
      return reply.code(status).send({
        code:
          error instanceof OnboardingError
            ? error.code
            : status < 500
              ? 'invalid_request'
              : 'unavailable',
        message: 'Unable to complete onboarding. Please retry.',
      });
    },
  };
  const onboarding = () => {
    if (!options.onboarding) throw new OnboardingError(503, 'unavailable');
    return options.onboarding;
  };
  app.post<{ Body: { disclosureVersion: string; timeZone?: string; intakeVersion?: 1 } }>(
    '/onboarding',
    {
      ...privateRoute,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['disclosureVersion'],
          properties: {
            disclosureVersion: { enum: ['onboarding-planning-v2', 'fixed-intake-v1'] },
            intakeVersion: { const: 1 },
            timeZone: { type: 'string', minLength: 1, maxLength: 80 },
          },
        },
      },
    },
    async (request) => {
      if (
        (request.body.intakeVersion === 1) !==
        (request.body.disclosureVersion === 'fixed-intake-v1')
      )
        throw new OnboardingError(400, 'invalid_request');
      return onboarding().create(
        accounts.get(request)!,
        request.body.timeZone,
        request.body.intakeVersion,
      );
    },
  );
  app.get<{ Params: { id: string } }>(
    '/onboarding/:id',
    { ...privateRoute, schema: { params: idSchema } },
    async (request) => onboarding().read(accounts.get(request)!, request.params.id),
  );
  app.post<{ Params: { id: string }; Body: Command }>(
    '/onboarding/:id/commands',
    { ...privateRoute, bodyLimit: 24000, schema: { params: idSchema, body: commandSchema } },
    async (request) => {
      const account = accounts.get(request)!;
      return onboarding().command(account, request.params.id, request.body, async () => {
        try {
          const next = await options.verifyAccount!(request.headers.authorization!.slice(7));
          return next?.userId === account.userId && next.sessionId === account.sessionId;
        } catch {
          return false;
        }
      });
    },
  );
  app.delete<{ Params: { id: string } }>(
    '/onboarding/:id',
    { ...privateRoute, schema: { params: idSchema } },
    async (request, reply) => {
      await onboarding().remove(accounts.get(request)!, request.params.id);
      return reply.code(204).send();
    },
  );
  const planning = () => {
    if (!options.planning) throw new OnboardingError(503, 'unavailable');
    return options.planning;
  };
  const revision = { type: 'integer', minimum: 1, maximum: 1000000 };
  const planId = {
    type: 'string',
    pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
  };
  app.post<{ Body: import('./features/onboarding/onboardingDomain.js').RecoveryRequest }>(
    '/training/clarification',
    {
      ...privateRoute,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['summaryRevision', 'planId', 'target'],
          properties: {
            summaryRevision: revision,
            planId,
            target: { type: 'string', pattern: '^(outline|[0-9]{4}-[0-9]{2}-[0-9]{2})$' },
          },
        },
      },
    },
    async (request) => {
      const account = accounts.get(request)!;
      return onboarding().clarify(account, request.body, async () => {
        try {
          const next = await options.verifyAccount!(request.headers.authorization!.slice(7));
          return next?.userId === account.userId && next.sessionId === account.sessionId;
        } catch {
          return false;
        }
      });
    },
  );
  app.get<{ Querystring: { offset?: string } }>('/training', privateRoute, async (request) =>
    planning().read(
      accounts.get(request)!,
      request.query.offset === undefined ? 0 : Number(request.query.offset),
    ),
  );
  app.put<{ Body: { version: string; scope: string; granted: boolean; expectedRevision: number } }>(
    '/training/consent',
    {
      ...privateRoute,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['version', 'scope', 'granted', 'expectedRevision'],
          properties: {
            version: { type: 'string', maxLength: 80 },
            scope: { type: 'string', maxLength: 80 },
            granted: { type: 'boolean' },
            expectedRevision: { type: 'integer', minimum: 0, maximum: 1000000 },
          },
        },
      },
    },
    async (request) => planning().consent(accounts.get(request)!, request.body),
  );
  app.put<{ Body: { version: string; scope: string; granted: boolean; expectedRevision: number } }>(
    '/training/history-consent',
    {
      ...privateRoute,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['version', 'scope', 'granted', 'expectedRevision'],
          properties: {
            version: { type: 'string', maxLength: 80 },
            scope: { type: 'string', maxLength: 80 },
            granted: { type: 'boolean' },
            expectedRevision: { type: 'integer', minimum: 0, maximum: 1000000 },
          },
        },
      },
    },
    async (request) => planning().historyConsent(accounts.get(request)!, request.body),
  );
  app.put<{ Body: { version: string; enabled: boolean; expectedRevision: number } }>(
    '/training/schedule',
    {
      ...privateRoute,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['version', 'enabled', 'expectedRevision'],
          properties: {
            version: { type: 'string', maxLength: 80 },
            enabled: { type: 'boolean' },
            expectedRevision: { type: 'integer', minimum: 0, maximum: 1000000 },
          },
        },
      },
    },
    async (r) => planning().schedule(accounts.get(r)!, r.body),
  );
  app.post<{ Body: { operationId: string; changes: string } }>(
    '/training/next-week',
    {
      ...privateRoute,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['operationId', 'changes'],
          properties: {
            operationId: { type: 'string', format: 'uuid' },
            changes: { type: 'string', maxLength: 2000 },
          },
        },
      },
    },
    async (r) => planning().ensureNextWeek(accounts.get(r)!, r.body),
  );
  app.get<{ Querystring: { date: string } }>(
    '/training/nutrition',
    {
      ...privateRoute,
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['date'],
          properties: { date: { type: 'string', maxLength: 10 } },
        },
      },
    },
    async (request) => planning().nutrition(accounts.get(request)!, request.query.date),
  );
  app.put<{ Body: { revision: number; document: TrainingSummary; timeZone: string } }>(
    '/training/summary',
    {
      ...privateRoute,
      bodyLimit: 96000,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['revision', 'document', 'timeZone'],
          properties: {
            revision,
            document: summarySchema,
            timeZone: { type: 'string', minLength: 1, maxLength: 80 },
          },
        },
      },
    },
    async (request) =>
      planning().edit(
        accounts.get(request)!,
        request.body.revision,
        request.body.document,
        request.body.timeZone,
      ),
  );
  app.post<{ Body: { revision: number } }>(
    '/training/plans',
    {
      ...privateRoute,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['revision'],
          properties: { revision },
        },
      },
    },
    async (request) => planning().ensurePlan(accounts.get(request)!, request.body.revision),
  );
  const planVersion = { summaryRevision: revision, planRevision: revision, planId };
  app.post<{ Body: import('./features/planning/planReview.js').PlanVersion }>(
    '/training/accept',
    {
      ...privateRoute,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: Object.keys(planVersion),
          properties: planVersion,
        },
      },
    },
    async (request) => planning().accept(accounts.get(request)!, request.body),
  );
  app.post<{ Body: import('./features/planning/planReview.js').ReviewRequest }>(
    '/training/review',
    {
      ...privateRoute,
      bodyLimit: 12000,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: [...Object.keys(planVersion), 'feedback', 'retryAttempt'],
          properties: {
            ...planVersion,
            feedback: { type: 'string', minLength: 1, maxLength: 2000, pattern: '\\S' },
            retryAttempt: { anyOf: [{ type: 'null' }, planId] },
          },
        },
      },
    },
    async (request) => {
      const account = accounts.get(request)!;
      return planning().review(account, request.body, async () => {
        try {
          const next = await options.verifyAccount!(request.headers.authorization!.slice(7));
          return next?.userId === account.userId && next.sessionId === account.sessionId;
        } catch {
          return false;
        }
      });
    },
  );
  app.post<{ Body: GenerationRequest }>(
    '/training/generate',
    {
      ...privateRoute,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['summaryRevision', 'planId', 'target', 'retryAttempt'],
          properties: {
            summaryRevision: revision,
            planId,
            planRevision: revision,
            confirmOutline: { type: 'boolean' },
            target: { type: 'string', pattern: '^(week|outline|[0-9]{4}-[0-9]{2}-[0-9]{2})$' },
            retryAttempt: { anyOf: [{ type: 'null' }, planId] },
          },
        },
      },
    },
    async (request) => {
      const account = accounts.get(request)!;
      return planning().generate(account, request.body, async () => {
        try {
          const next = await options.verifyAccount!(request.headers.authorization!.slice(7));
          return next?.userId === account.userId && next.sessionId === account.sessionId;
        } catch {
          return false;
        }
      });
    },
  );
  const weight = () => {
    if (!options.weight) throw new OnboardingError(503, 'unavailable');
    return options.weight;
  };
  app.get<{ Querystring: { offset?: string } }>('/body-weight', privateRoute, async (r) =>
    weight().list(accounts.get(r)!, r.query.offset === undefined ? 0 : Number(r.query.offset)),
  );
  app.get<{ Params: { id: string } }>('/body-weight/operations/:id', privateRoute, async (r) =>
    weight().readOperation(accounts.get(r)!, r.params.id),
  );
  app.get<{ Params: { id: string } }>('/body-weight/:id', privateRoute, async (r) =>
    weight().read(accounts.get(r)!, r.params.id),
  );
  app.post<{ Body: import('./shared/weightContract.js').WeightCommand }>(
    '/body-weight/commands',
    { ...privateRoute, bodyLimit: 4000 },
    async (r) => weight().command(accounts.get(r)!, r.body),
  );
  const journal = () => {
    if (!options.journal) throw new OnboardingError(503, 'unavailable');
    return options.journal;
  };
  app.get<{ Querystring: { offset?: string } }>('/workout-journal', privateRoute, async (r) =>
    journal().list(accounts.get(r)!, r.query.offset === undefined ? 0 : Number(r.query.offset)),
  );
  app.get<{ Params: { id: string } }>('/workout-journal/operations/:id', privateRoute, async (r) =>
    journal().readOperation(accounts.get(r)!, r.params.id),
  );
  app.get<{ Params: { id: string } }>('/workout-journal/:id', privateRoute, async (r) =>
    journal().read(accounts.get(r)!, r.params.id),
  );
  app.post<{ Body: import('./shared/journalContract.js').JournalCommand }>(
    '/workout-journal/commands',
    { ...privateRoute, bodyLimit: 128000 },
    async (r) => journal().command(accounts.get(r)!, r.body),
  );
  const library = () => {
    if (!options.library) throw new OnboardingError(503, 'unavailable');
    return options.library;
  };
  app.get('/food-library', privateRoute, async (request) => library().read(accounts.get(request)!));
  app.get<{ Params: { id: string } }>(
    '/food-library/operations/:id',
    privateRoute,
    async (request) => library().readOperation(accounts.get(request)!, request.params.id),
  );
  app.post<{ Body: import('./shared/foodContract.js').LibraryCommand }>(
    '/food-library/commands',
    { ...privateRoute, bodyLimit: 28000 },
    async (request) => library().command(accounts.get(request)!, request.body),
  );
  const food = () => {
    if (!options.food) throw new OnboardingError(503, 'unavailable');
    return options.food;
  };
  app.get<{ Querystring: { date: string; timeZone: string } }>(
    '/food',
    {
      ...privateRoute,
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['date', 'timeZone'],
          properties: {
            date: { type: 'string', maxLength: 10 },
            timeZone: { type: 'string', maxLength: 80 },
          },
        },
      },
    },
    async (request) =>
      food().read(accounts.get(request)!, request.query.date, request.query.timeZone),
  );
  app.get<{ Params: { id: string } }>(
    '/food/operations/:id',
    { ...privateRoute, schema: { params: idSchema } },
    async (request) => food().readOperation(accounts.get(request)!, request.params.id),
  );
  app.post<{ Body: FoodCommand }>(
    '/food/commands',
    { ...privateRoute, bodyLimit: 28000 },
    async (request) => {
      const account = accounts.get(request)!;
      return food().command(account, request.body, async () => {
        try {
          const next = await options.verifyAccount!(request.headers.authorization!.slice(7));
          return next?.userId === account.userId && next.sessionId === account.sessionId;
        } catch {
          return false;
        }
      });
    },
  );
  return app;
}
