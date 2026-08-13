/**
 * Competing-consumers listener. Run it in two or more terminals at once:
 *
 *   REDIS_URL=redis://127.0.0.1:6379 node packages/api-kit/samples/worker.js
 *
 * Then start the publisher (publisher.js) in another terminal. Each
 * `order.placed` event is delivered to exactly ONE of the running listeners,
 * never to all of them: within a subscriber, BullMQ hands every delivery to a
 * single consumer. Watch the events split across the windows — the pid printed
 * on each line tells you which listener won that event.
 *
 * Needs a running Redis and the optional peers: npm i ioredis bullmq
 */
import { createEventBus } from '@devindex/api-kit/events';

const bus = createEventBus({
  driver: 'bullmq', // bullmq or memory
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  prefix: 'sample-orders',
});

bus.subscribe('order.placed', 'fulfil', async ({ orderId, total }, { key }) => {
  console.log(`[listener ${process.pid}] handled ${key} (order #${orderId}) — $${total}`);
}, { concurrency: 1 });

async function main() {
  await bus.start();
  console.log(`[listener ${process.pid}] waiting for order.placed events — Ctrl+C to stop`);

  const shutdown = async (signal) => {
    console.log(`\n[listener ${process.pid}] ${signal} received, draining...`);
    await bus.stop({ timeoutMs: 10_000 });
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
