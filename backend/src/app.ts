import Fastify, { type FastifyServerOptions } from 'fastify';

export function buildApp(logger: FastifyServerOptions['logger'] = false) {
  const app = Fastify({ logger, ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });

  app.get('/health', async () => ({ service: 'fitquest-api', status: 'ok' }));

  const textField = { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' };
  app.post('/profile-intake', {
    logLevel: 'silent',
    bodyLimit: 4096,
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
  }, async () => ({ message: 'User Data Saved' }));

  return app;
}
