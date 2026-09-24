import fastify from 'fastify';
import { HealthResponseSchema } from '@fitquest-rebuild/contracts';

export function createApp() {
  const app = fastify();

  app.get('/health', async () => HealthResponseSchema.parse({
    status: 'ok',
    service: 'fitquest-api',
    phase: 'scaffold',
  }));

  return app;
}
