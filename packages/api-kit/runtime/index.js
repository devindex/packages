/**
 * Runs `close` once on the first termination signal, then exits the process.
 *
 * @param {(signal: string) => (void | Promise<void>)} close - The teardown to run.
 * @param {object} [options]
 * @param {string[]} [options.signals=['SIGINT','SIGTERM']] - Signals that trigger it.
 * @param {number} [options.timeoutMs=10000] - Hard deadline; a hung `close` force-exits with 1.
 * @param {{ error: Function }} [options.logger] - Logs the failure before exiting with 1.
 */
export function onShutdown(close, { signals = ['SIGINT', 'SIGTERM'], timeoutMs = 10_000, logger } = {}) {
  let running = false;

  const handle = async (signal) => {
    // A second signal mid-drain must not run `close` twice.
    if (running) return;
    running = true;

    // Don't unref this timer: a hung `close` that stops pinning the event loop
    // would then let the process exit 0, reporting success for a failed shutdown.
    const deadline = setTimeout(() => process.exit(1), timeoutMs);

    try {
      await close(signal);
      clearTimeout(deadline);
      process.exit(0);
    } catch (error) {
      clearTimeout(deadline);
      logger?.error({ err: error }, 'shutdown failed');
      process.exit(1);
    }
  };

  // Wiring the signal is all this owns; teardown order stays inside `close`.
  for (const signal of signals) {
    process.once(signal, () => handle(signal));
  }
}
