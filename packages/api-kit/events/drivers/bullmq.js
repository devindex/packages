import {
  loadBullmq,
  queueName,
  redisConnection,
} from '../../internal/bullmq.js';
import { noopLogger } from '../../internal/logger.js';
import { subscriberStream } from '../internal.js';

/**
 * Distributed backend on BullMQ, one queue per subscriber stream. Redis is only
 * its store.
 *
 * @param {object} options
 * @param {string} options.redisUrl
 * @param {string} [options.prefix='app']
 * @param {object} [options.logger]
 * @return {object} A backend: add, work and stop.
 */
export function bullmqBackend({ redisUrl, prefix = 'app', logger = noopLogger } = {}) {
  const queueConnection = redisConnection(redisUrl);
  const workerConnection = redisConnection(redisUrl, { worker: true });
  const queuePromises = new Map();
  const workers = new Set();

  /** Get or create the per-stream BullMQ queue with its retention policy. */
  function getQueue(stream) {
    let promise = queuePromises.get(stream);
    if (!promise) {
      promise = (async () => {
        const { Queue } = await loadBullmq();
        return new Queue(queueName(prefix, 'event', stream), {
          connection: queueConnection,
          defaultJobOptions: {
            removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
            removeOnFail: { age: 7 * 24 * 60 * 60 },
          },
        });
      })();
      queuePromises.set(stream, promise);
    }
    return promise;
  }

  return {
    async add(stream, event, payload, { key, dedupId, eventId, attempts, backoff, delay = 0 }) {
      const queue = await getQueue(stream);
      const job = await queue.add(event, { payload, key, eventId }, {
        attempts,
        backoff,
        deduplication: { id: dedupId },
        ...(delay > 0 ? { delay } : {}),
      });
      return job.id;
    },

    async work(event, subscriber, definition) {
      const { Worker } = await loadBullmq();
      const stream = subscriberStream(event, subscriber);
      const queue = await getQueue(stream);
      const worker = new Worker(queue.name, async (job, _token, signal) => {
        if (job.name !== event) {
          throw new Error(`event "${job.name}" reached the "${subscriber}" worker for "${event}"`);
        }
        const attempt = job.attemptsMade + 1;
        const totalAttempts = job.opts.attempts ?? 1;
        const log = logger.child({ event, subscriber, key: job.data.key, deliveryId: job.id });
        try {
          return await definition.handler(job.data.payload, {
            event,
            subscriber,
            eventId: job.data.eventId,
            key: job.data.key,
            attempt,
            attemptsLeft: totalAttempts - attempt,
            signal,
            log,
          });
        } catch (error) {
          // A retry that BullMQ will re-run is a warning; only the last attempt is
          // an error, so expected transient retries don't trip error-rate alerts.
          const final = attempt >= totalAttempts;
          log[final ? 'error' : 'warn']({ err: error, attempt, final }, 'event delivery failed');
          throw error;
        }
      }, { connection: workerConnection, concurrency: definition.concurrency });
      workers.add(worker);
      worker.on('error', (error) => logger.error({ err: error, event, subscriber }, 'event worker error'));
      worker.on('stalled', (jobId) => {
        logger.error({ event, subscriber, deliveryId: jobId }, 'event delivery stalled and will be delivered again');
      });

      // Surface a worker that cannot reach Redis at start(), not silently later.
      await worker.waitUntilReady();
    },

    // BullMQ owns the drain deadline once worker.close() starts, so the bus's
    // timeoutMs is accepted for a uniform signature but not used here.
    async stop() {
      // Workers first: they stop taking deliveries and let the running ones finish.
      const workerResults = await Promise.allSettled([...workers].map((worker) => worker.close()));
      const queueResults = await Promise.allSettled([...queuePromises.values()]);
      const closeResults = await Promise.allSettled(
        queueResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value.close()] : [])),
      );
      for (const result of [...workerResults, ...queueResults, ...closeResults]) {
        if (result.status === 'rejected') logger.error({ err: result.reason }, 'event bus close failed');
      }
      workers.clear();
      queuePromises.clear();
    },
  };
}
