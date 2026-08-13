import { analytics } from './domain.js';

/**
 * Declares every subscriber. Must run before bus.start(). Fan-out: one
 * `order.placed` reaches both subscribers independently, so one failing and
 * retrying never blocks the other. The `send-receipt` subscriber hands the work
 * to the job queue rather than doing it inline.
 */
export function registerEvents(bus, { jobs }) {
  bus.subscribe('order.placed', 'send-receipt', async ({ orderId }) => {
    await jobs.enqueue('send-receipt', { orderId }, { key: `receipt:${orderId}` });
  });

  bus.subscribe('order.placed', 'update-analytics', async ({ orderId }, { log }) => {
    await analytics.record(orderId);
    log.info({ orderId }, 'analytics updated');
  }, { concurrency: 10 });
}
