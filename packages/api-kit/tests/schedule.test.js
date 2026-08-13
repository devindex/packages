import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchedule } from '../schedule/index.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('schedule drivers are explicit and Redis configuration is inert', () => {
  assert.equal(createSchedule().driver, 'memory');
  assert.equal(createSchedule({ driver: 'bullmq', redisUrl: 'redis://127.0.0.1:6379' }).driver, 'bullmq');
  assert.throws(() => createSchedule({ driver: 'sqs' }), /unknown schedule driver/);
  assert.throws(() => createSchedule({ driver: 'bullmq' }), /requires `redisUrl`/);
});

test('definitions contain only cron pattern and timezone', () => {
  const schedule = createSchedule();
  schedule.define(
    'settlement',
    { pattern: '0 15 3 * * *', timeZone: 'America/Sao_Paulo' },
    async () => {},
  );

  assert.deepEqual(schedule.list(), [{
    name: 'settlement',
    pattern: '0 15 3 * * *',
    timeZone: 'America/Sao_Paulo',
  }]);
  assert.throws(() => schedule.define('settlement', { pattern: '* * * * * *' }, async () => {}), /already declared/);
  assert.throws(() => schedule.define('missing', {}, async () => {}), /non-empty cron pattern/);
});

test('the memory schedule runs cron directly and prevents local overlap', async (t) => {
  const schedule = createSchedule();
  t.after(() => schedule.stop());
  const started = deferred();
  const release = deferred();
  let runs = 0;
  schedule.define('heartbeat', { pattern: '* * * * * *' }, async ({ name, signal, log }) => {
    runs += 1;
    assert.equal(name, 'heartbeat');
    assert.ok(signal instanceof AbortSignal);
    assert.equal(typeof log.info, 'function');
    started.resolve();
    await release.promise;
  });
  await schedule.start();
  await started.promise;
  await new Promise((resolve) => setTimeout(resolve, 1_100));

  assert.equal(runs, 1);
  release.resolve();
});

test('remove stops future local ticks', async (t) => {
  const schedule = createSchedule();
  t.after(() => schedule.stop());
  let runs = 0;
  schedule.define('heartbeat', { pattern: '* * * * * *' }, async () => {
    runs += 1;
  });
  await schedule.start();

  assert.equal(await schedule.remove('heartbeat'), true);
  await new Promise((resolve) => setTimeout(resolve, 1_100));

  assert.equal(runs, 0);
  assert.deepEqual(schedule.list(), []);
});

test('both drivers accept remove() before start()', async () => {
  for (const options of [{ driver: 'memory' }, { driver: 'bullmq', redisUrl: 'redis://127.0.0.1:6379' }]) {
    const schedule = createSchedule(options);
    schedule.define('settlement', { pattern: '0 15 3 * * *' }, async () => {});

    // Inert: nothing is scheduled in Redis yet, so this must not connect.
    assert.equal(await schedule.remove('settlement'), true);
    assert.equal(await schedule.remove('settlement'), false);
    assert.deepEqual(schedule.list(), []);
    assert.equal(schedule.state, 'idle');
  }
});

test('stop aborts and waits for active local handlers', async () => {
  const schedule = createSchedule();
  const started = deferred();
  const release = deferred();
  let observed;
  schedule.define('heartbeat', { pattern: '* * * * * *' }, async ({ signal }) => {
    observed = signal;
    started.resolve();
    await release.promise;
  });
  await schedule.start();
  await started.promise;

  const stopping = schedule.stop();
  assert.equal(observed.aborted, true);
  release.resolve();
  await stopping;

  assert.equal(schedule.state, 'stopped');
  await assert.rejects(() => schedule.start(), /cannot be restarted/);
});
