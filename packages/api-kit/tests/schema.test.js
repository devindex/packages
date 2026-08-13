import test from 'node:test';
import assert from 'node:assert/strict';
import { clock } from '../http/schema.js';

test('clock accepts a time of day and rejects the invalid 24th hour', () => {
  const pattern = new RegExp(clock.pattern);
  for (const valid of ['00:00', '09:30', '23:59']) {
    assert.ok(pattern.test(valid), `${valid} should be a valid clock`);
  }
  for (const invalid of ['24:00', '24:30', '23:60', '9:30']) {
    assert.ok(!pattern.test(invalid), `${invalid} should be rejected`);
  }
});
