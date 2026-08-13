import { Cron } from 'croner';
import { noopLogger } from '../../internal/logger.js';

/**
 * In-process backend on Croner. Runs each schedule directly in this process,
 * skipping a tick while its previous run is still active, and keeps nothing once
 * the process exits.
 *
 * @param {object} [options]
 * @param {object} [options.logger]
 * @return {object} A backend: schedule, unschedule and stop.
 */
export function memoryBackend({ logger = noopLogger } = {}) {
  const clocks = new Map();
  const active = new Map();

  /** Run one tick unless the previous run is still active; each run gets its own abort signal. */
  function run(name, definition) {
    if (active.has(name)) {
      logger.warn({ schedule: name }, 'schedule tick skipped because the previous run is active');
      return;
    }
    const controller = new AbortController();
    const log = logger.child({ schedule: name });
    const promise = Promise.resolve()
      .then(() => definition.handler({ name, signal: controller.signal, log }))
      .catch((error) => logger.error({ err: error, schedule: name }, 'schedule failed'))
      .finally(() => active.delete(name));
    active.set(name, { controller, promise });
  }

  return {
    /** Start a croner clock that fires run() on each occurrence. */
    async schedule(name, definition) {
      const clock = new Cron(
        definition.spec.pattern,
        { name, timezone: definition.spec.timeZone },
        () => run(name, definition),
      );
      clocks.set(name, clock);
    },

    /** Stop future ticks for one schedule and drop its clock. */
    async unschedule(name) {
      clocks.get(name)?.stop();
      clocks.delete(name);
    },

    // No drain deadline today: aborted runs are awaited unbounded, so `timeoutMs`
    // is ignored. `removeSchedulers` has no meaning in-process — there is no shared
    // scheduler, only local clocks, which stop either way.
    async stop() {
      for (const clock of clocks.values()) clock.stop();
      clocks.clear();
      for (const entry of active.values()) entry.controller.abort();
      await Promise.allSettled([...active.values()].map((entry) => entry.promise));
    },
  };
}
