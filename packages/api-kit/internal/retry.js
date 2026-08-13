import { createHash } from 'node:crypto';
import { assertDuration, assertPositiveInt } from './validation.js';

export const DEFAULTS = Object.freeze({
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 },
  concurrency: 1,
});

export function dedupId(name, key) {
  // NUL separates the fields so ("ab","c") and ("a","bc") can't collide.
  return createHash('sha256').update(`${name}\0${key}`).digest('hex');
}

export function normalizeBackoff(backoff) {
  if (typeof backoff === 'number') return assertDuration('backoff', backoff);
  if (!backoff || !['fixed', 'exponential'].includes(backoff.type)) {
    throw new TypeError('backoff must be milliseconds or `{ type: "fixed"|"exponential", delay }`');
  }
  return Object.freeze({
    type: backoff.type,
    delay: assertDuration('backoff.delay', backoff.delay),
  });
}

// setTimeout clamps anything past ~24.8 days to 1ms, turning a slow backoff into
// a hot retry loop; keep the delay under that ceiling so large `attempts` stay spaced.
const MAX_BACKOFF_MS = 2_147_483_647;

export function backoffDelay(backoff, attempt) {
  if (typeof backoff === 'number') return backoff;
  if (backoff.type !== 'exponential') return backoff.delay;
  return Math.min(MAX_BACKOFF_MS, backoff.delay * 2 ** (attempt - 1));
}

export function resolveDefinition(defaults, options = {}) {
  return Object.freeze({
    attempts: assertPositiveInt('attempts', options.attempts ?? defaults.attempts),
    backoff: normalizeBackoff(options.backoff ?? defaults.backoff),
    concurrency: assertPositiveInt('concurrency', options.concurrency ?? defaults.concurrency),
  });
}
