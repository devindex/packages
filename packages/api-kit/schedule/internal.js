import { assertName } from '../internal/validation.js';

/**
 * Validates a schedule spec and freezes it with defaults applied.
 *
 * @param {string} name - Schedule name, used only in error messages.
 * @param {{pattern?: string, timeZone?: string}} [spec] - `timeZone` defaults to `'UTC'`.
 * @return {Readonly<{pattern: string, timeZone: string}>}
 * @throws {TypeError} On an empty name, pattern or timezone.
 */
export function normalizeSchedule(name, spec = {}) {
  const scheduleName = assertName(name, 'schedule');
  if (typeof spec.pattern !== 'string' || spec.pattern.trim().length === 0) {
    throw new TypeError(`the schedule for "${scheduleName}" needs a non-empty cron pattern`);
  }
  const timeZone = spec.timeZone ?? 'UTC';
  if (typeof timeZone !== 'string' || timeZone.length === 0) {
    throw new TypeError(`the timezone for "${scheduleName}" must be a non-empty string`);
  }
  return Object.freeze({ pattern: spec.pattern.trim(), timeZone });
}
