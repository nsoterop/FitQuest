import Fastify from 'fastify';

export function buildApp(logger = false) {
  const app = Fastify({ logger });

  app.get('/health', async () => ({ service: 'fitquest-api', status: 'ok' }));

  return app;
}
