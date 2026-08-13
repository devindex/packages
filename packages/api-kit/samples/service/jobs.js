import { mailer } from './domain.js';

/**
 * Declares every background job. Must run before jobs.start(); only declared
 * names can be enqueued. The handler is idempotent — delivery is at-least-once,
 * so `key` is what stops a retry from sending the receipt twice.
 */
export function registerJobs(jobs) {
  jobs.define('send-receipt', async ({ orderId }, { key, log }) => {
    await mailer.sendReceipt(orderId, { idempotencyKey: key });
    log.info({ orderId }, 'receipt sent');
  }, { concurrency: 5 });
}
