import { loadBullmq, queueName } from '../../internal/bullmq.js';
import { redisConnection } from '../../internal/redis.js';
import { noopLogger } from '../../internal/logger.js';

const SCHEDULER_ID = 'schedule';

/**
 * Distributed backend on BullMQ's Job Scheduler, one queue per schedule name.
 * Every replica upserts the same leaderless scheduler and starts an equivalent
 * worker; BullMQ coordinates which worker receives each occurrence. Redis is only
 * its store.
 *
 * @param {object} options
 * @param {string} options.redisUrl
 * @param {string} [options.prefix='app']
 * @param {object} [options.logger]
 * @return {object} A backend: schedule, unschedule and stop.
 */
export function bullmqBackend({ redisUrl, prefix = 'app', logger = noopLogger } = {}) {
  const queueConnection = redisConnection(redisUrl);
  const workerConnection = redisConnection(redisUrl, { worker: true });
  const queuePromises = new Map();
  const workers = new Map();

  /** Get or create the per-name schedule queue: single attempt, small retention. */
  function getQueue(name) {
    let promise = queuePromises.get(name);
    if (!promise) {
      promise = (async () => {
        const { Queue } = await loadBullmq();
        return new Queue(queueName(prefix, 'schedule', name), {
          connection: queueConnection,
          defaultJobOptions: {
            attempts: 1,
            removeOnComplete: { age: 24 * 60 * 60, count: 100 },
            removeOnFail: { age: 7 * 24 * 60 * 60 },
          },
        });
      })();
      queuePromises.set(name, promise);
    }
    return promise;
  }

  /** Remove the shared Job Scheduler from every queue this replica opened. */
  async function removeAllSchedulers() {
    await Promise.allSettled([...queuePromises.values()].map(async (queuePromise) => {
      const queue = await queuePromise;
      await queue.removeJobScheduler(SCHEDULER_ID);
    }));
  }

  /** Close every worker and queue this replica opened, logging each failure. */
  async function closeResources() {
    for (const worker of workers.values()) worker.cancelAllJobs(new Error('schedule is stopping'));
    const workerResults = await Promise.allSettled([...workers.values()].map((worker) => worker.close()));
    const queueResults = await Promise.allSettled([...queuePromises.values()]);
    const closeResults = await Promise.allSettled(
      queueResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value.close()] : [])),
    );
    for (const result of [...workerResults, ...queueResults, ...closeResults]) {
      if (result.status === 'rejected') logger.error({ err: result.reason }, 'schedule close failed');
    }
    workers.clear();
    queuePromises.clear();
  }

  return {
    /** Start a worker and upsert the leaderless Job Scheduler for one schedule. */
    async schedule(name, definition) {
      const { Worker } = await loadBullmq();
      const queue = await getQueue(name);
      await queue.setGlobalConcurrency(1);
      const worker = new Worker(queue.name, async (job, _token, signal) => {
        if (job.name !== name) throw new Error(`schedule "${job.name}" reached the worker for "${name}"`);
        const log = logger.child({ schedule: name, runId: job.id });
        try {
          return await definition.handler({ name, signal, log });
        } catch (error) {
          logger.error({ err: error, schedule: name, runId: job.id }, 'schedule failed');
          throw error;
        }
      }, { connection: workerConnection, concurrency: 1 });
      workers.set(name, worker);
      worker.on('error', (error) => logger.error({ err: error, schedule: name }, 'schedule worker error'));
      worker.on('stalled', (jobId) => {
        logger.error({ schedule: name, runId: jobId }, 'schedule stalled and will be delivered again');
      });
      await worker.waitUntilReady();
      await queue.upsertJobScheduler(
        SCHEDULER_ID,
        { pattern: definition.spec.pattern, tz: definition.spec.timeZone },
        { name, data: {} },
      );
    },

    /** Remove one schedule's Job Scheduler and close its local worker and queue. */
    async unschedule(name) {
      // Before start() (or after stop()) nothing exists in Redis yet, so dropping
      // the declaration is enough — this mirrors the memory backend's inert removal.
      if (!queuePromises.has(name)) return;
      const queue = await getQueue(name);
      await queue.removeJobScheduler(SCHEDULER_ID);
      const worker = workers.get(name);
      if (worker) {
        worker.cancelAllJobs(new Error(`schedule "${name}" was removed`));
        await worker.close();
        workers.delete(name);
      }
      await queue.close();
      queuePromises.delete(name);
    },

    // BullMQ owns the drain deadline once worker.close() starts, so `timeoutMs` is
    // accepted for a uniform signature but not used here.
    async stop({ removeSchedulers = false } = {}) {
      // A failed start owns the schedulers it upserted and removes them, or they
      // orphan jobs into queues no worker drains; a normal stop leaves the shared
      // scheduler so other replicas keep it (leaderless).
      if (removeSchedulers) await removeAllSchedulers();
      await closeResources();
    },
  };
}
