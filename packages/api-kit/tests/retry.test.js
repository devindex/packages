import test from 'node:test';
import assert from 'node:assert/strict';
import { backoffDelay } from '../internal/retry.js';

test('backoffDelay grows exponentially and stays under the setTimeout ceiling', () => {
  const exponential = { type: 'exponential', delay: 1_000 };
  assert.equal(backoffDelay(exponential, 1), 1_000);
  assert.equal(backoffDelay(exponential, 2), 2_000);
  assert.equal(backoffDelay(exponential, 3), 4_000);

  // A large attempt count would overflow setTimeout and collapse to 1ms; cap instead.
  assert.equal(backoffDelay(exponential, 40), 2_147_483_647);
});

test('backoffDelay returns the flat delay for fixed and numeric backoff', () => {
  assert.equal(backoffDelay({ type: 'fixed', delay: 500 }, 5), 500);
  assert.equal(backoffDelay(750, 3), 750);
});
