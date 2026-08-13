import { noopLogger } from '../internal/logger.js';
import {
  assertDuration,
  assertHandler,
  assertKey,
  assertName,
} from '../internal/validation.js';
import {
  DEFAULTS,
  dedupId,
  normalizeBackoff,
  resolveDefinition,
} from '../internal/retry.js';
import { memoryBackend } from './drivers/memory.js';
import { bullmqBackend } from './drivers/bullmq.js';

// Named for what runs the jobs, not for its store: the distributed backend is
// BullMQ (Redis is only where it keeps state), so the semantics a caller gets —
// stalled recovery, deduplication, retention — are BullMQ's, and the name says so.
const BACKENDS = { memory: memoryBackend, bullmq: bullmqBackend };

/**
 * Creates a volatile local queue or a distributed BullMQ queue.
 *
 * The lifecycle — declaration, dedup keys, state — lives here; each backend only
 * add()s, work()s and stop()s. enqueue() needs neither define() nor start(), so a
 * producer-only process dispatches by name without running a worker.
 *
 * @param {object} [options]
 * @param {'memory'|'bullmq'} [options.driver='memory']
 * @param {string} [options.redisUrl] - Required by the BullMQ driver.
 * @param {string} [options.prefix='app']
 * @param {object} [options.logger]
 * @param {object} [options.defaults] - `attempts`, `backoff`, `concurrency`.
 * @return {object} The queue: define, enqueue, start, stop, idle and state.
 */
export function createJobQueue({
  driver = 'memory',
  redisUrl,
  prefix = 'app',
  logger = noopLogger,
  defaults = {},
} = {}) {
  const createBackend = BACKENDS[driver];
  if (!createBackend) {
    throw new Error(`unknown job driver "${driver}", expected ${Object.keys(BACKENDS).join(' or ')}`);
  }
  const merged = Object.freeze({
    attempts: defaults.attempts ?? DEFAULTS.attempts,
    backoff: normalizeBackoff(defaults.backoff ?? DEFAULTS.backoff),
    concurrency: defaults.concurrency ?? DEFAULTS.concurrency,
  });

  const definitions = new Map();
  const backend = createBackend({ redisUrl, prefix, logger });
  let state = 'idle';

  /**
   * Declares a job before start(); the name must be unique.
   *
   * @param {string} name
   * @param {(payload: *, context: object) => (void|Promise<void>)} handler
   * @param {object} [options] - Per-job overrides: `attempts`, `backoff`, `concurrency`.
   * @return {void}
   */
  function define(name, handler, options = {}) {
    if (state !== 'idle') throw new Error('jobs must be declared before start()');
    const jobName = assertName(name);
    assertHandler(jobName, handler);
    if (definitions.has(jobName)) throw new Error(`job "${jobName}" is already declared`);
    definitions.set(jobName, { handler, ...resolveDefinition(merged, options) });
  }

  /**
   * Enqueues a job by name; the name need not be declared in this process.
   *
   * @param {string} name
   * @param {*} payload - Passed to the handler as its first argument.
   * @param {object} options
   * @param {string} options.key - Required, non-empty idempotency key.
   * @param {number} [options.delay=0] - Milliseconds before the job becomes runnable.
   * @return {Promise<{jobId: string, name: string, key: string}>}
   */
  async function enqueue(name, payload, { key: givenKey, delay = 0 } = {}) {
    // No define()/start() required: a producer-only process enqueues by name.
    if (state === 'stopping' || state === 'stopped') {
      throw new Error('cannot enqueue on a stopped job queue');
    }
    const jobName = assertName(name);
    const key = assertKey(givenKey);
    assertDuration('delay', delay);
    // A producer that never declared the job takes its retry policy from
    // `defaults`; per-job overrides live on the consumer's define().
    const policy = definitions.get(jobName) ?? merged;
    const jobId = await backend.add(jobName, payload, {
      key,
      dedupId: dedupId(jobName, key),
      attempts: policy.attempts,
      backoff: policy.backoff,
      delay,
    });
    return Object.freeze({ jobId, name: jobName, key });
  }

  async function start() {
    if (state === 'started') return;
    if (state === 'stopped') throw new Error('a stopped job queue cannot be restarted');
    if (state !== 'idle') throw new Error('the job queue is already changing state');
    state = 'starting';
    // allSettled lets every worker register before a failure surfaces, so a
    // rejection mid-start can't leak the workers its siblings already created.
    const results = await Promise.allSettled(
      [...definitions].map(([name, definition]) => backend.work(name, definition)),
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) {
      state = 'stopping';
      await backend.stop({});
      state = 'stopped';
      throw failed.reason;
    }
    state = 'started';
  }

  /**
   * Stops intake and drains in-flight jobs.
   *
   * @param {object} [options]
   * @param {number} [options.timeoutMs=30000] - Drain deadline before abandoning
   *   in-flight jobs (memory driver; the BullMQ driver lets BullMQ own the deadline).
   * @return {Promise<void>}
   */
  async function stop(options = {}) {
    if (state === 'stopped') return;
    state = 'stopping';
    await backend.stop(options);
    state = 'stopped';
  }

  /** Resolves once nothing is delayed, queued or running. */
  function idle() {
    return backend.idle();
  }

  return Object.freeze({
    driver,
    define,
    enqueue,
    start,
    stop,
    idle,
    get state() {
      return state;
    },
  });
}
