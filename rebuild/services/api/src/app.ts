import fastify from 'fastify';
import { z, ZodError } from 'zod';
import { ApiErrorSchema, CommandSchema, HealthResponseSchema, IdentityResponseSchema, OperationOutcomeSchema, ProfileSnapshotSchema, SessionListSchema, SessionSnapshotSchema } from '@fitquest-rebuild/contracts';
import { OperationIdReused, OwnerUnavailable, PostgresAthleteRepository } from './repository';

export interface IdentityBoundary { verifyBearer(token: string): Promise<string | null> | string | null }
export function createApp(options?: { repository: PostgresAthleteRepository; identity: IdentityBoundary }) {
  const app = fastify();

  app.get('/health', async () => HealthResponseSchema.parse({
    status: 'ok',
    service: 'fitquest-api',
    phase: 'scaffold',
  }));

  if (options) {
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/v1/')) reply.header('Cache-Control', 'no-store');
    });
    app.setErrorHandler((error, _request, reply) => {
      const status = error instanceof OperationIdReused ? 409 : error instanceof OwnerUnavailable ? 401 : error instanceof ZodError || (error instanceof Error && 'statusCode' in error && error.statusCode === 400) ? 400 : 500;
      const code = status === 409 ? 'OPERATION_ID_REUSED' : status === 401 ? 'UNAUTHORIZED' : status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
      reply.code(status).send(ApiErrorSchema.parse({ code, message: status === 500 ? 'Request could not be completed.' : status === 409 ? 'Operation ID was used for different content.' : status === 401 ? 'Authorization required.' : 'Invalid request.' }));
    });
    const owner = async (header: string | undefined) => {
      const match = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(header ?? '');
      if (!match) throw new OwnerUnavailable();
      const accountId = await options.identity.verifyBearer(match[1]);
      if (!accountId) throw new OwnerUnavailable();
      return accountId;
    };
    const id = z.uuid();
    app.get('/v1/identity', async (request, reply) => {
      const accountId = await owner(request.headers.authorization);
      await options.repository.profile(accountId);
      return reply.send(IdentityResponseSchema.parse({ accountId }));
    });
    app.post('/v1/commands', async (request, reply) => {
      const accountId = await owner(request.headers.authorization);
      const command = CommandSchema.parse(request.body);
      return reply.send(OperationOutcomeSchema.parse(await options.repository.execute(accountId, command)));
    });
    app.get('/v1/operations/:operationId', async (request, reply) => {
      const accountId = await owner(request.headers.authorization);
      const operationId = id.parse((request.params as { operationId?: unknown }).operationId);
      const outcome = await options.repository.outcome(accountId, operationId);
      return outcome ? reply.send(OperationOutcomeSchema.parse(outcome)) : reply.code(404).send(ApiErrorSchema.parse({ code: 'NOT_FOUND', message: 'Record not found.' }));
    });
    app.get('/v1/profile', async (request, reply) => {
      const accountId = await owner(request.headers.authorization);
      return reply.send(ProfileSnapshotSchema.parse(await options.repository.profile(accountId)));
    });
    app.get('/v1/sessions', async (request, reply) => {
      const accountId = await owner(request.headers.authorization);
      const params = z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }).strict().parse(request.query);
      return reply.send(SessionListSchema.parse(await options.repository.sessions(accountId, params.limit ?? 20)));
    });
    app.get('/v1/sessions/:sessionId', async (request, reply) => {
      const accountId = await owner(request.headers.authorization);
      const sessionId = id.parse((request.params as { sessionId?: unknown }).sessionId);
      const snapshot = await options.repository.session(accountId, sessionId);
      return snapshot ? reply.send(SessionSnapshotSchema.parse(snapshot)) : reply.code(404).send(ApiErrorSchema.parse({ code: 'NOT_FOUND', message: 'Record not found.' }));
    });
  }

  return app;
}
