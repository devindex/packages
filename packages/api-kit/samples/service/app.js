import { createApp } from '@devindex/api-kit/http';
import { context } from './infra.js';
import { makeRoutes } from './routes.js';

/**
 * Assembles the HTTP stack (cors, helmet, requestId, the error envelope) and
 * returns it without listening — starting the server is the entrypoint's job.
 * Fastify's own request logging is left off to keep the sample dependency-free;
 * a real service passes its pino instance here as `logger`.
 */
export function buildApp({ bus }) {
  return createApp({ context, routes: makeRoutes({ bus, context }) });
}
