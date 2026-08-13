import { assertName } from '../internal/validation.js';

export function assertSubscriber(name) {
  return assertName(name, 'subscriber');
}

/**
 * Identity of one subscriber's durable stream for an event.
 *
 * @return {string} Key backing both the Redis queue name and the dedup id.
 */
export function subscriberStream(event, subscriber) {
  return `${event}::${subscriber}`;
}
