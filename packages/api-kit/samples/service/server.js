/**
 * Runnable composition of the whole kit: routes, jobs, events, schedule and one
 * error envelope, torn down by a single signal handler.
 *
 *   node packages/api-kit/samples/service/server.js
 *
 * Runs in memory with nothing installed. Point it at Redis to make jobs,
 * events and the schedule durable and cluster-wide:
 *
 *   REDIS_URL=redis://127.0.0.1:6379 node packages/api-kit/samples/service/server.js
 *
 * The Redis path needs the optional peers: npm i ioredis bullmq
 */
import { onShutdown } from '@devindex/api-kit/runtime';
import { logger, jobs, bus, schedule } from './infra.js';
import { registerJobs } from './jobs.js';
import { registerEvents } from './events.js';
import { registerSchedules } from './schedule.js';
import { buildApp } from './app.js';

// 1. Declare everything while the factories are still idle.
registerJobs(jobs);
registerEvents(bus, { jobs });
registerSchedules(schedule);

const app = await buildApp({ bus });

// 2. Background infra comes up before HTTP accepts traffic, so a route can
//    publish the moment it is reachable.
await Promise.all([jobs.start(), bus.start(), schedule.start()]);

// 3. Listen.
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
logger.info({ port }, 'sample service up — POST /orders to see the pieces fire');

// 4. One place owns graceful shutdown: stop accepting HTTP first, then drain
//    the consumers behind it. onShutdown wires the signal, runs this once and
//    exits.
onShutdown(async () => {
  await app.close();
  await Promise.allSettled([
    jobs.stop({ timeoutMs: 10_000 }),
    bus.stop({ timeoutMs: 10_000 }),
    schedule.stop(),
  ]);
}, { logger });
