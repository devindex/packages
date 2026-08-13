import { randomUUID } from 'node:crypto';
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
import { assertSubscriber, subscriberStream } from './internal.js';
import { memoryBackend } from './drivers/memory.js';
import { bullmqBackend } from './drivers/bullmq.js';

// Named for what delivers the events, not for its store: the distributed backend
// is BullMQ (Redis is only where it keeps state), so the semantics a caller gets —
// stalled recovery, deduplication, retention — are BullMQ's, and the name says so.
const BACKENDS = { memory: memoryBackend, bullmq: bullmqBackend };

/**
 * Creates a volatile local event bus or a distributed BullMQ event bus. Each
 * published event fans out to every named subscriber independently.
 *
 * The lifecycle — declaration, fan-out, dedup keys, state — lives here; each
 * backend only add()s, work()s and stop()s.
 *
 * @param {object} [options]
 * @param {'memory'|'bullmq'} [options.driver='memory']
 * @param {string} [options.redisUrl] - Required by the BullMQ driver.
 * @param {string} [options.prefix='app']
 * @param {object} [options.logger]
 * @param {object} [options.defaults] - Per-subscriber attempts, backoff and concurrency.
 * @return {object} The bus, not yet started; call start() first.
 */
export function createEventBus({
  driver = 'memory',
  redisUrl,
  prefix = 'app',
  logger = noopLogger,
  defaults = {},
} = {}) {
  const createBackend = BACKENDS[driver];
  if (!createBackend) {
    throw new Error(`unknown event bus driver "${driver}", expected ${Object.keys(BACKENDS).join(' or ')}`);
  }
  const merged = Object.freeze({
    attempts: defaults.attempts ?? DEFAULTS.attempts,
    backoff: normalizeBackoff(defaults.backoff ?? DEFAULTS.backoff),
    concurrency: defaults.concurrency ?? DEFAULTS.concurrency,
  });

  const subscribers = new Map();
  const backend = createBackend({ redisUrl, prefix, logger });
  let state = 'idle';

  /**
   * Declares a subscriber before start(); the (event, subscriber) pair must be unique.
   *
   * @param {string} event
   * @param {string} subscriber - Names an independent, durable delivery stream for the event.
   * @param {(payload: *, context: object) => (void|Promise<void>)} handler
   * @param {object} [options] - Per-subscriber overrides: `attempts`, `backoff`, `concurrency`.
   * @return {void}
   */
  function subscribe(event, subscriber, handler, options = {}) {
    if (state !== 'idle') throw new Error('subscribers must be declared before start()');
    const eventName = assertName(event, 'event');
    const subscriberName = assertSubscriber(subscriber);
    assertHandler(subscriberStream(eventName, subscriberName), handler);
    let group = subscribers.get(eventName);
    if (!group) {
      group = new Map();
      subscribers.set(eventName, group);
    }
    if (group.has(subscriberName)) {
      throw new Error(`subscriber "${subscriberName}" is already declared for event "${eventName}"`);
    }
    group.set(subscriberName, { handler, ...resolveDefinition(merged, options) });
  }

  /**
   * Publishes an event to every declared subscriber.
   *
   * @param {string} event
   * @param {*} payload - Passed to each subscriber handler as its first argument.
   * @param {object} options
   * @param {string} options.key - Required, non-empty idempotency key.
   * @param {number} [options.delay=0] - Milliseconds before delivery becomes runnable.
   * @return {Promise<{eventId: string, event: string, key: string, deliveries: ReadonlyArray<{subscriber: string, deliveryId: string}>}>}
   */
  async function publish(event, payload, { key: givenKey, delay = 0 } = {}) {
    if (state !== 'started') throw new Error('the event bus must be started before publish()');
    const eventName = assertName(event, 'event');
    const key = assertKey(givenKey);
    assertDuration('delay', delay);
    const eventId = randomUUID();
    const group = subscribers.get(eventName);
    if (!group || group.size === 0) {
      // Publisher and subscriber are decoupled: a publish with no listeners is a
      // valid no-op, not an error.
      logger.debug({ event: eventName, eventId }, 'event published with no subscribers');
      return Object.freeze({ eventId, event: eventName, key, deliveries: Object.freeze([]) });
    }

    // Fan-out: each subscriber has its own stream, dedup identity and delivery.
    const deliveries = await Promise.all([...group].map(async ([subscriber, definition]) => {
      const stream = subscriberStream(eventName, subscriber);
      const deliveryId = await backend.add(stream, eventName, payload, {
        key,
        dedupId: dedupId(stream, key),
        eventId,
        attempts: definition.attempts,
        backoff: definition.backoff,
        delay,
      });
      return Object.freeze({ subscriber, deliveryId });
    }));
    return Object.freeze({ eventId, event: eventName, key, deliveries: Object.freeze(deliveries) });
  }

  async function start() {
    if (state === 'started') return;
    if (state === 'stopped') throw new Error('a stopped event bus cannot be restarted');
    if (state !== 'idle') throw new Error('the event bus is already changing state');
    state = 'starting';
    const definitions = [...subscribers].flatMap(([event, group]) =>
      [...group].map(([subscriber, definition]) => ({ event, subscriber, definition })));
    // allSettled lets every worker register before a failure surfaces, so a
    // rejection mid-start can't leak the workers its siblings already created.
    const results = await Promise.allSettled(
      definitions.map(({ event, subscriber, definition }) => backend.work(event, subscriber, definition)),
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
   * Stops intake and drains in-flight deliveries.
   *
   * @param {object} [options]
   * @param {number} [options.timeoutMs=30000] - Drain deadline before abandoning
   *   in-flight deliveries (memory driver; the BullMQ driver lets BullMQ own the deadline).
   * @return {Promise<void>}
   */
  async function stop(options = {}) {
    if (state === 'stopped') return;
    state = 'stopping';
    await backend.stop(options);
    state = 'stopped';
  }

  return Object.freeze({
    driver,
    subscribe,
    publish,
    start,
    stop,
    get state() {
      return state;
    },
  });
}
