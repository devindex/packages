import { loadBullmq, queueName } from '../../internal/bullmq.js';
import { redisConnection } from '../../internal/redis.js';
import { noopLogger } from '../../internal/logger.js';

/**
 * Distributed backend on BullMQ, one queue per job name. Redis is only its store.
 *
 * @param {object} options
 * @param {string} options.redisUrl
 * @param {string} [options.prefix='app']
 * @param {object} [options.logger]
 * @return {object} A backend: add, work, stop and idle.
 */
export function bullmqBackend({ redisUrl, prefix = 'app', logger = noopLogger } = {}) {
  const queueConnection = redisConnection(redisUrl);
  const workerConnection = redisConnection(redisUrl, { worker: true });
  const queuePromises = new Map();
  const workers = new Set();

  function getQueue(name) {
    let promise = queuePromises.get(name);
    if (!promise) {
      promise = (async () => {
        const { Queue } = await loadBullmq();
        return new Queue(queueName(prefix, 'job', name), {
          connection: queueConnection,
          defaultJobOptions: {
            removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
            removeOnFail: { age: 7 * 24 * 60 * 60 },
          },
        });
      })();
      queuePromises.set(name, promise);
    }
    return promise;
  }

  return {
    async add(name, payload, { key, dedupId, attempts, backoff, delay = 0 }) {
      const queue = await getQueue(name);
      const job = await queue.add(name, { payload, key }, {
        attempts,
        backoff,
        deduplication: { id: dedupId },
        ...(delay > 0 ? { delay } : {}),
      });
      return job.id;
    },

    async work(name, definition) {
      const { Worker } = await loadBullmq();
      const queue = await getQueue(name);
      const worker = new Worker(queue.name, async (job, _token, signal) => {
        if (job.name !== name) throw new Error(`job "${job.name}" reached the worker for "${name}"`);
        const attempt = job.attemptsMade + 1;
        const totalAttempts = job.opts.attempts ?? 1;
        const log = logger.child({ job: name, key: job.data.key, jobId: job.id });
        try {
          return await definition.handler(job.data.payload, {
            name,
            jobId: job.id,
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
          log[final ? 'error' : 'warn']({ err: error, attempt, final }, 'job attempt failed');
          throw error;
        }
      }, { connection: workerConnection, concurrency: definition.concurrency });
      workers.add(worker);
      worker.on('error', (error) => logger.error({ err: error, job: name }, 'worker error'));
      worker.on('stalled', (jobId) => {
        logger.error({ job: name, jobId }, 'job stalled and will be delivered again');
      });

      // Surface a worker that cannot reach Redis at start(), not silently later.
      await worker.waitUntilReady();
    },

    async idle() {
      while (true) {
        const queues = await Promise.all([...queuePromises.values()]);
        const remaining = await Promise.all(
          queues.map((queue) => queue.getJobCountByTypes(
            'active',
            'waiting',
            'delayed',
            'prioritized',
            'waiting-children',
          )),
        );
        if (remaining.every((count) => count === 0)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },

    // BullMQ owns the drain deadline once worker.close() starts, so the queue's
    // timeoutMs is accepted for a uniform signature but not used here.
    async stop() {
      // Workers first: they stop taking jobs and let the running ones finish.
      const workerResults = await Promise.allSettled([...workers].map((worker) => worker.close()));
      const queueResults = await Promise.allSettled([...queuePromises.values()]);
      const closeResults = await Promise.allSettled(
        queueResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value.close()] : [])),
      );
      for (const result of [...workerResults, ...queueResults, ...closeResults]) {
        if (result.status === 'rejected') logger.error({ err: result.reason }, 'job queue close failed');
      }
      workers.clear();
      queuePromises.clear();
    },
  };
}
