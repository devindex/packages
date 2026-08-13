import { randomUUID } from 'node:crypto';
import { noopLogger } from '../../internal/logger.js';
import { backoffDelay } from '../../internal/retry.js';

/**
 * In-process backend for tests and local runs. Honors delay, attempts, backoff,
 * deduplication and concurrency, and keeps nothing once the process exits.
 *
 * @param {object} [options]
 * @param {object} [options.logger]
 * @return {object} A backend: add, work, stop and idle.
 */
export function memoryBackend({ logger = noopLogger } = {}) {
  const consumers = new Map();
  const lanes = new Map();
  const dedup = new Map();
  const timers = new Set();
  const inFlight = new Set();
  const shutdown = new AbortController();
  let closed = false;

  /** Get or create the per-name queue: its backlog, head pointer and running count. */
  function lane(name) {
    let entry = lanes.get(name);
    if (!entry) {
      entry = { waiting: [], head: 0, running: 0 };
      lanes.set(name, entry);
    }
    return entry;
  }

  /** Resolve after `ms`, or early if the queue is stopped, without leaking the timer. */
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

  /** Run one job through its handler, retrying with backoff until it succeeds or exhausts attempts. */
  async function run(name, definition, job) {
    const log = logger.child({ job: name, key: job.key, jobId: job.id });
    try {
      for (let attempt = 1; attempt <= definition.attempts; attempt += 1) {
        try {
          await definition.handler(job.payload, {
            name,
            jobId: job.id,
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
          log[final ? 'error' : 'warn']({ err: error, attempt, final }, 'job attempt failed');
          if (final) return;
          await sleep(backoffDelay(definition.backoff, attempt));
          if (shutdown.signal.aborted) return;
        }
      }
    } finally {
      if (dedup.get(job.dedupId) === job.id) dedup.delete(job.dedupId);
    }
  }

  /** Start as many queued jobs for `name` as concurrency allows, re-pumping as each finishes. */
  function pump(name) {
    const definition = consumers.get(name);
    // A producer enqueues names this process never declared; without a local
    // worker there is nothing here to run them.
    if (closed || !definition) return;
    const entry = lane(name);
    while (entry.running < definition.concurrency && entry.head < entry.waiting.length) {
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
      const promise = run(name, definition, job).finally(() => {
        entry.running -= 1;
        inFlight.delete(promise);
        pump(name);
      });
      inFlight.add(promise);
    }
  }

  return {
    async add(name, payload, { key, dedupId, delay = 0 }) {
      if (closed) throw new Error('cannot enqueue on a stopped job queue');
      // Dedup is held only while the job is in flight, so the same key is free
      // again once the job settles.
      const held = dedup.get(dedupId);
      if (held) return held;

      const jobId = randomUUID();
      dedup.set(dedupId, jobId);
      const job = { id: jobId, dedupId, key, payload };

      if (delay > 0) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (closed) return;
          lane(name).waiting.push(job);
          pump(name);
        }, delay);
        timers.add(timer);
      } else {
        lane(name).waiting.push(job);
        pump(name);
      }
      return jobId;
    },

    async work(name, definition) {
      // Draining here picks up anything enqueued before the worker existed.
      consumers.set(name, definition);
      pump(name);
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
        logger.warn({ timeoutMs, pending: inFlight.size }, 'job queue stop timed out; abandoning in-flight jobs');
      }

      lanes.clear();
      dedup.clear();
      inFlight.clear();
    },

    /** Resolves once nothing is delayed, queued or running. */
    async idle() {
      while (
        timers.size
        || inFlight.size
        || [...lanes.values()].some((entry) => entry.head < entry.waiting.length)
      ) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
  };
}
