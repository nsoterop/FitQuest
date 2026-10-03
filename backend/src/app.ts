import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Account, VerifyAccount } from './auth.js';
import type { ProfileInput, ProfileStore } from './profileStore.js';

export function buildApp(logger: FastifyServerOptions['logger'] = false,
  options: { store?: ProfileStore; verifyAccount?: VerifyAccount } = {}) {
  const app = Fastify({ logger, ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  const accounts = new WeakMap<object, Account>();

  const requireAccount: import('fastify').onRequestAsyncHookHandler = async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    let account: Account | null = null;
    try {
      if (match && options.verifyAccount) account = await options.verifyAccount(match[1]!);
      if (account && options.store && !await options.store.sessionActive(account)) account = null;
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
  app.post<{ Body: ProfileInput }>('/profile-intake', {
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
            type: 'object', additionalProperties: false, required: ['value', 'unit'],
            properties: {
              value: { type: 'integer', minimum: 1, maximum: 120 },
              unit: { type: 'string', const: 'in' },
            },
          },
          weight: {
            type: 'object', additionalProperties: false, required: ['value', 'unit'],
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
      const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode : 500;
      return reply.code(status).send({ message: status < 500
        ? 'Check all six fields and use inches and pounds.'
        : 'Unable to submit right now. Please try again.' });
    },
  }, async (request, reply) => {
    try {
      if (!options.store) throw new Error('Profile storage unavailable.');
      await options.store.save(accounts.get(request)!, request.body);
      return { message: 'User Data Saved' };
    } catch {
      return reply.code(503).send({ message: 'Unable to save your profile. Please try again.' });
    }
  });

  app.get('/profile', { logLevel: 'silent', onRequest: requireAccount,
    errorHandler(_error, _request, reply) {
      return reply.code(503).send({ message: 'Unable to load your profile. Please try again.' });
    },
  }, async (request, reply) => {
    try {
      if (!options.store) throw new Error('Profile storage unavailable.');
      return { profile: await options.store.read(accounts.get(request)!) };
    } catch {
      return reply.code(503).send({ message: 'Unable to load your profile. Please try again.' });
    }
  });

  return app;
}
