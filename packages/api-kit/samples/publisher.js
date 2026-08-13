/**
 * Emitter for the competing-consumers demo. Run one of these:
 *
 *   REDIS_URL=redis://127.0.0.1:6379 node packages/api-kit/samples/publisher.js
 *
 * It publishes an `order.placed` event every five seconds. Start two or more
 * `worker.js` listeners first, then this, and watch each event land in exactly
 * one listener window.
 *
 * Note: this bus enqueues a delivery only for subscribers declared in the same
 * process (see publish() in events/index.js), so a publisher must declare the
 * `fulfil` subscriber to reach its queue — which also makes THIS process one of
 * the competing consumers. Its handler is labelled `[publisher ...]` so, when it
 * wins an event, you still see it handled exactly once across every window. Run
 * more `worker.js` instances if you want the publisher to win less often.
 *
 * Needs a running Redis and the optional peers: npm i ioredis bullmq
 */
import { createEventBus } from '@devindex/api-kit/events';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

const bus = createEventBus({
  driver: 'bullmq',
  redisUrl,
  prefix: 'sample-orders',
});

bus.subscribe('order.placed', 'fulfil', async ({ orderId, total }, { key }) => {
  console.log(`[publisher ${process.pid}] handled ${key} (order #${orderId}) — $${total}`);
}, { concurrency: 1 });

async function main() {
  await bus.start();
  console.log(`[publisher ${process.pid}] emitting order.placed every 5s — Ctrl+C to stop`);

  // Namespace the order id with the publisher's pid so ids stay unique when
  // several publishers emit against the same Redis at once.
  const publisherId = process.pid;
  let id = 0;
  const interval = setInterval(async () => {
    id += 1;
    const orderId = `${publisherId}-${String(id).padStart(2, '0')}`;
    const total = (Math.random() * 100).toFixed(2);
    try {
      // The logical `key` is per-order, so the same order is never delivered
      // twice to the `fulfil` subscriber while one delivery is still in flight.
      await bus.publish('order.placed', { orderId, total }, { key: `order:${orderId}` });
      console.log(`[publisher ${process.pid}] published order #${orderId} — $${total}`);
    } catch (error) {
      console.error(`[publisher ${process.pid}] publish failed`, error);
    }
  }, 5_000);

  const shutdown = async (signal) => {
    console.log(`\n[publisher ${process.pid}] ${signal} received, draining...`);
    clearInterval(interval);
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
