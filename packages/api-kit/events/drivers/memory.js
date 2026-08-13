import { randomUUID } from 'node:crypto';
import { noopLogger } from '../../internal/logger.js';
import { backoffDelay } from '../../internal/retry.js';
import { subscriberStream } from '../internal.js';

/**
 * In-process backend for tests and local runs. Honors delay, attempts, backoff,
 * deduplication and concurrency, and keeps nothing once the process exits.
 *
 * @param {object} [options]
 * @param {object} [options.logger]
 * @return {object} A backend: add, work and stop.
 */
export function memoryBackend({ logger = noopLogger } = {}) {
  const consumers = new Map();
  const lanes = new Map();
  const dedup = new Map();
  const timers = new Set();
  const inFlight = new Set();
  const shutdown = new AbortController();
  let closed = false;

  /** Get or create the per-stream queue: its backlog, head pointer and running count. */
  function lane(stream) {
    let entry = lanes.get(stream);
    if (!entry) {
      entry = { waiting: [], head: 0, running: 0 };
      lanes.set(stream, entry);
    }
    return entry;
  }

  /** Resolve after `ms`, or early if the bus is stopped, without leaking the timer. */
  function sleep(ms) {
    if (ms === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        timers.delete(timer);
        shutdown.signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      timers.add(timer);
      shutdown.signal.addEventListener('abort', done, { once: true });
    });
  }

  /** Deliver one job to its subscriber, retrying with backoff until it succeeds or exhausts attempts. */
  async function run(consumer, job) {
    const { definition, event, subscriber } = consumer;
    const log = logger.child({ event, subscriber, key: job.key, deliveryId: job.id });
    try {
      for (let attempt = 1; attempt <= definition.attempts; attempt += 1) {
        try {
          await definition.handler(job.payload, {
            event,
            subscriber,
            eventId: job.eventId,
            key: job.key,
            attempt,
            attemptsLeft: definition.attempts - attempt,
            signal: shutdown.signal,
            log,
          });
          return;
        } catch (error) {
          // A retry that will run again is a warning; only the last failure is an
          // error, so expected transient retries don't trip error-rate alerts.
          const final = attempt === definition.attempts || shutdown.signal.aborted;
          log[final ? 'error' : 'warn']({ err: error, attempt, final }, 'event delivery failed');
          if (final) return;
          await sleep(backoffDelay(definition.backoff, attempt));
          if (shutdown.signal.aborted) return;
        }
      }
    } finally {
      if (dedup.get(job.dedupId) === job.id) dedup.delete(job.dedupId);
    }
  }

  /** Start as many queued deliveries for `stream` as concurrency allows, re-pumping as each finishes. */
  function pump(stream) {
    const consumer = consumers.get(stream);
    if (closed || !consumer) return;
    const entry = lane(stream);
    while (entry.running < consumer.definition.concurrency && entry.head < entry.waiting.length) {
      const job = entry.waiting[entry.head];
      entry.waiting[entry.head] = undefined; // drop the payload reference for GC
      entry.head += 1;
      // `shift()` reindexes the whole backlog (O(n^2) under a burst); a head
      // pointer keeps dequeue O(1), compacted so it can't grow unbounded.
      if (entry.head > 1024 && entry.head * 2 >= entry.waiting.length) {
        entry.waiting = entry.waiting.slice(entry.head);
        entry.head = 0;
      }
      entry.running += 1;
      const promise = run(consumer, job).finally(() => {
        entry.running -= 1;
        inFlight.delete(promise);
        pump(stream);
      });
      inFlight.add(promise);
    }
  }

  return {
    async add(stream, event, payload, { key, dedupId, eventId, delay = 0 }) {
      if (closed) throw new Error('cannot publish on a stopped event bus');
      // Dedup is held only while the delivery is in flight, so the same key is
      // free again once the delivery settles.
      const held = dedup.get(dedupId);
      if (held) return held;

      const deliveryId = randomUUID();
      dedup.set(dedupId, deliveryId);
      const job = { id: deliveryId, dedupId, key, payload, eventId };

      if (delay > 0) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (closed) return;
          lane(stream).waiting.push(job);
          pump(stream);
        }, delay);
        timers.add(timer);
      } else {
        lane(stream).waiting.push(job);
        pump(stream);
      }
      return deliveryId;
    },

    async work(event, subscriber, definition) {
      // Draining here picks up anything published before the worker existed.
      const stream = subscriberStream(event, subscriber);
      consumers.set(stream, { definition, event, subscriber });
      pump(stream);
    },

    async stop({ timeoutMs = 30_000 } = {}) {
      if (closed) return;
      closed = true;
      shutdown.abort();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const entry of lanes.values()) {
        entry.waiting.length = 0;
        entry.head = 0;
      }

      // A handler that ignores `signal` would otherwise keep the process alive
      // forever, so drain in-flight work under a deadline instead of unbounded.
      const drained = await Promise.race([
        Promise.allSettled([...inFlight]).then(() => true),
        new Promise((resolve) => {
          setTimeout(() => resolve(false), timeoutMs).unref?.();
        }),
      ]);
      if (!drained) {
        logger.warn({ timeoutMs, pending: inFlight.size }, 'event bus stop timed out; abandoning in-flight deliveries');
      }

      lanes.clear();
      dedup.clear();
      inFlight.clear();
    },
  };
}
