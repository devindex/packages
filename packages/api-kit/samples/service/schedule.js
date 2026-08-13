import { settle } from './domain.js';

/**
 * Declares every cron entry. Must run before schedule.start(). The pattern is
 * the six-field form, seconds first. It runs every ten seconds here so the
 * effect is visible while the sample is up; a real settlement would use
 * something like '0 0 3 * * *' with a timeZone.
 */
export function registerSchedules(schedule) {
  schedule.define(
    'settlement',
    { pattern: '*/10 * * * * *' },
    async ({ signal, log }) => {
      log.info('running settlement');
      await settle({ signal });
    },
  );
}
