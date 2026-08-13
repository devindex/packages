import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSchedule } from '../schedule/index.js';
import { queueName, redisConnection } from '../internal/bullmq.js';

if (process.env.REQUIRE_REDIS === '1' && !process.env.REDIS_URL) {
  throw new Error('REQUIRE_REDIS=1 needs REDIS_URL');
}

test('two Redis replicas share one scheduler without a leader', {
  skip: process.env.REDIS_URL ? false : 'set REDIS_URL to run the Redis scheduler contract',
  timeout: 10_000,
}, async (t) => {
  const options = {
    driver: 'bullmq',
    redisUrl: process.env.REDIS_URL,
    prefix: `test-schedule-${randomUUID()}`,
  };
  let active = 0;
  let peak = 0;
  let runs = 0;
  const handler = async () => {
    active += 1;
    peak = Math.max(peak, active);
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 80));
    active -= 1;
  };
  const replicas = [createSchedule(options), createSchedule(options)];
  t.after(() => Promise.all(replicas.map((schedule) => schedule.stop())));
  for (const replica of replicas) {
    replica.define('heartbeat', { pattern: '* * * * * *' }, handler);
  }

  await Promise.all(replicas.map((schedule) => schedule.start()));
  await new Promise((resolve) => setTimeout(resolve, 2_200));
  await replicas[0].remove('heartbeat');

  assert.ok(runs >= 1, `expected at least one run, got ${runs}`);
  assert.ok(runs <= 3, `expected one cluster run per tick, got ${runs}`);
  assert.equal(peak, 1);
});

test('a failed start rolls back the schedulers it already upserted', {
  skip: process.env.REDIS_URL ? false : 'set REDIS_URL to run the Redis scheduler contract',
  timeout: 10_000,
}, async (t) => {
  const prefix = `test-schedule-${randomUUID()}`;
  const schedule = createSchedule({ driver: 'bullmq', redisUrl: process.env.REDIS_URL, prefix });
  t.after(() => schedule.stop());

  schedule.define('good', { pattern: '* * * * * *' }, async () => {});
  // An unparseable cron clears normalizeSchedule (non-empty) but makes
  // upsertJobScheduler reject, so this definition fails *after* `good` has
  // already persisted its scheduler in Redis.
  schedule.define('bad', { pattern: 'not-a-cron' }, async () => {});

  await assert.rejects(schedule.start());
  assert.equal(schedule.state, 'stopped');

  // Independently confirm `good` left no orphaned scheduler producing jobs into a
  // queue no worker drains — the leak the rollback exists to prevent.
  const { Queue } = await import('bullmq');
  const queue = new Queue(queueName(prefix, 'schedule', 'good'), {
    connection: redisConnection(process.env.REDIS_URL),
  });
  t.after(() => queue.close());
  assert.equal(await queue.getJobSchedulersCount(), 0, 'the upserted scheduler must be rolled back');
});
