import { createApp } from './app';

const port = Number(process.env.PORT ?? 3400);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535');
}

const app = createApp();
app.listen({ host: '127.0.0.1', port }).catch((error: unknown) => {
  console.error('API failed to start:', error);
  process.exitCode = 1;
});
