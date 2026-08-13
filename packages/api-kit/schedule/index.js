import { noopLogger } from '../internal/logger.js';
import { assertHandler, assertName } from '../internal/validation.js';
import { normalizeSchedule } from './internal.js';
import { memoryBackend } from './drivers/memory.js';
import { bullmqBackend } from './drivers/bullmq.js';

// Named for what runs the schedules, not for its store: the distributed backend
// is BullMQ (Redis is only where it keeps state), so the semantics a caller gets —
// leaderless coordination, global serialization, retention — are BullMQ's.
const BACKENDS = { memory: memoryBackend, bullmq: bullmqBackend };

/**
 * Creates an in-process Croner schedule or a distributed BullMQ schedule.
 *
 * The lifecycle — declaration, listing, state — lives here; each backend only
 * schedule()s, unschedule()s and stop()s.
 *
 * @param {object} [options]
 * @param {'memory'|'bullmq'} [options.driver='memory']
 * @param {string} [options.redisUrl] - Required by the BullMQ driver.
 * @param {string} [options.prefix='app']
 * @param {object} [options.logger]
 * @return {object} The schedule, not yet started; call start() first.
 */
export function createSchedule({
  driver = 'memory',
  redisUrl,
  prefix = 'app',
  logger = noopLogger,
} = {}) {
  const createBackend = BACKENDS[driver];
  if (!createBackend) {
    throw new Error(`unknown schedule driver "${driver}", expected ${Object.keys(BACKENDS).join(' or ')}`);
  }

  const definitions = new Map();
  const backend = createBackend({ redisUrl, prefix, logger });
  let state = 'idle';

  /**
   * Declares a schedule before start(); the name must be unique.
   *
   * @param {string} name
   * @param {{pattern: string, timeZone?: string}} spec - Cron pattern (6- or 5-field); `timeZone` defaults to `'UTC'`.
   * @param {(context: {name: string, signal: AbortSignal, log: object}) => (void|Promise<void>)} handler
   * @return {void}
   */
  function define(name, spec, handler) {
    if (state !== 'idle') throw new Error('schedules must be declared before start()');
    const scheduleName = assertName(name, 'schedule');
    assertHandler(scheduleName, handler);
    if (definitions.has(scheduleName)) throw new Error(`schedule "${scheduleName}" is already declared`);
    definitions.set(scheduleName, { spec: normalizeSchedule(scheduleName, spec), handler });
  }

  async function start() {
    if (state === 'started') return;
    if (state === 'stopped') throw new Error('a stopped schedule cannot be restarted');
    if (state !== 'idle') throw new Error('the schedule is already changing state');
    state = 'starting';
    // allSettled so every scheduler finishes upserting before we roll back; a
    // mid-flight reject would let a straggler upsert after cleanup, orphaning it.
    const results = await Promise.allSettled(
      [...definitions].map(([name, definition]) => backend.schedule(name, definition)),
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) {
      state = 'stopping';
      // This replica upserted these schedulers in this aborting call, so it owns
      // their removal; left behind they produce jobs into queues no worker drains.
      await backend.stop({ removeSchedulers: true });
      state = 'stopped';
      throw failed.reason;
    }
    state = 'started';
  }

  /**
   * Stops future ticks and drops the declaration.
   *
   * @param {string} name
   * @return {Promise<boolean>} Whether the schedule was declared here.
   */
  async function remove(name) {
    const scheduleName = assertName(name, 'schedule');
    await backend.unschedule(scheduleName);
    return definitions.delete(scheduleName);
  }

  async function stop(options = {}) {
    if (state === 'stopped') return;
    state = 'stopping';
    await backend.stop(options);
    state = 'stopped';
  }

  return Object.freeze({
    driver,
    define,
    start,
    stop,
    remove,
    /** @return {Array<{name: string, pattern: string, timeZone: string}>} Local declarations. */
    list: () => [...definitions].map(([name, definition]) => ({ name, ...definition.spec })),
    get state() {
      return state;
    },
  });
}
