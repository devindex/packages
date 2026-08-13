import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createJobQueue } from '../jobs/index.js';

if (process.env.REQUIRE_REDIS === '1' && !process.env.REDIS_URL) {
  throw new Error('REQUIRE_REDIS=1 needs REDIS_URL');
}

const DRIVERS = [
  { name: 'memory', options: { driver: 'memory' }, skip: false },
  {
    name: 'bullmq',
    options: { driver: 'bullmq', redisUrl: process.env.REDIS_URL, prefix: `test-job-${randomUUID()}` },
    skip: process.env.REDIS_URL ? false : 'set REDIS_URL to run the BullMQ contract',
  },
];

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function eventually(check, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('condition was not met before timeout');
}

for (const driver of DRIVERS) {
  const suite = (name, fn) => test(`[${driver.name}] ${name}`, { skip: driver.skip }, fn);
  const options = { ...driver.options, defaults: { backoff: 0 } };

  const withQueue = async (t, body) => {
    const queue = createJobQueue(options);
    t.after(() => queue.stop());
    return body(queue);
  };

  suite('a declared job receives its payload and context', (t) => withQueue(t, async (queue) => {
    const done = deferred();
    queue.define('welcome', async (payload, context) => done.resolve({ payload, context }));
    await queue.start();

    const submitted = await queue.enqueue('welcome', { userId: 7 }, { key: 'user:7' });
    const seen = await done.promise;

    assert.equal(submitted.name, 'welcome');
    assert.equal(submitted.key, 'user:7');
    assert.deepEqual(seen.payload, { userId: 7 });
    assert.equal(seen.context.jobId, submitted.jobId);
    assert.equal(seen.context.key, 'user:7');
    assert.equal(seen.context.attempt, 1);
    assert.ok(seen.context.signal instanceof AbortSignal);
  }));

  suite('the same active identity returns the same job', (t) => withQueue(t, async (queue) => {
    const started = deferred();
    const release = deferred();
    let runs = 0;
    queue.define('welcome', async () => {
      runs += 1;
      started.resolve();
      await release.promise;
    });
    await queue.start();

    const first = await queue.enqueue('welcome', {}, { key: 'user:7' });
    await started.promise;
    const second = await queue.enqueue('welcome', {}, { key: 'user:7' });
    release.resolve();

    assert.equal(second.jobId, first.jobId);
    await eventually(() => runs === 1);
  }));

  suite('an identity is released after completion', (t) => withQueue(t, async (queue) => {
    let runs = 0;
    const twice = deferred();
    queue.define('report', async () => {
      runs += 1;
      if (runs === 2) twice.resolve();
    });
    await queue.start();

    const first = await queue.enqueue('report', {}, { key: 'r:1' });
    const second = await eventually(async () => {
      const candidate = await queue.enqueue('report', {}, { key: 'r:1' });
      return candidate.jobId === first.jobId ? null : candidate;
    });
    await twice.promise;

    assert.notEqual(second.jobId, first.jobId);
    assert.equal(runs, 2);
  }));

  suite('failed attempts retry with a rising attempt number', (t) => withQueue(t, async (queue) => {
    const attempts = [];
    const done = deferred();
    queue.define('flaky', async (_payload, context) => {
      attempts.push(context.attempt);
      if (context.attempt < 3) throw new Error('not yet');
      done.resolve();
    }, { attempts: 3 });
    await queue.start();

    await queue.enqueue('flaky', {}, { key: 'once' });
    await done.promise;

    assert.deepEqual(attempts, [1, 2, 3]);
  }));

  suite('definition concurrency controls parallel work', (t) => withQueue(t, async (queue) => {
    let active = 0;
    let peak = 0;
    const started = deferred();
    const release = deferred();
    const finished = deferred();
    let completed = 0;
    queue.define('parallel', async () => {
      active += 1;
      peak = Math.max(peak, active);
      if (peak === 2) started.resolve();
      await release.promise;
      active -= 1;
      completed += 1;
      if (completed === 3) finished.resolve();
    }, { concurrency: 2 });
    await queue.start();

    await Promise.all(['a', 'b', 'c'].map((key) => queue.enqueue('parallel', {}, { key })));
    await started.promise;
    release.resolve();
    await finished.promise;

    assert.equal(peak, 2);
  }));

  suite('delay postpones execution', (t) => withQueue(t, async (queue) => {
    const done = deferred();
    const before = Date.now();
    queue.define('later', async () => done.resolve(Date.now()));
    await queue.start();

    await queue.enqueue('later', {}, { key: 'one', delay: 40 });
    const ranAt = await done.promise;

    assert.ok(ranAt - before >= 30, `job ran after ${ranAt - before}ms`);
  }));

  suite('idle waits for delayed and active work', (t) => withQueue(t, async (queue) => {
    const started = deferred();
    const release = deferred();
    let idle = false;
    queue.define('later', async () => {
      started.resolve();
      await release.promise;
    });
    await queue.start();
    await queue.enqueue('later', {}, { key: 'one', delay: 40 });

    const waiting = queue.idle().then(() => {
      idle = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(idle, false);

    await started.promise;
    assert.equal(idle, false);
    release.resolve();
    await waiting;
    assert.equal(idle, true);
  }));

  suite('missing or invalid keys are refused', (t) => withQueue(t, async (queue) => {
    queue.define('known', async () => {});
    await queue.start();

    await assert.rejects(() => queue.enqueue('known', {}, {}), /`key` must be a non-empty string/);
    await assert.rejects(() => queue.enqueue('known', {}, { key: 123 }), /must be a non-empty string, got number/);
    await assert.rejects(() => queue.enqueue('known', {}, { key: 'one', delay: -1 }), />= 0 milliseconds/);
  }));

  suite('a producer enqueues names it never declared', (t) => withQueue(t, async (queue) => {
    // Producer-only: no define(), no worker here. Enqueue is accepted so a
    // separate consumer process can run the job.
    const submitted = await queue.enqueue('elsewhere', { userId: 7 }, { key: 'user:7' });

    assert.equal(submitted.name, 'elsewhere');
    assert.equal(submitted.key, 'user:7');
    assert.ok(submitted.jobId);
  }));

  suite('stop waits for active handlers', async () => {
    const queue = createJobQueue(options);
    const started = deferred();
    const release = deferred();
    let finished = false;
    queue.define('slow', async () => {
      started.resolve();
      await release.promise;
      finished = true;
    });
    await queue.start();
    await queue.enqueue('slow', {}, { key: 'one' });
    await started.promise;

    const stopping = queue.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(finished, false);
    release.resolve();
    await stopping;

    assert.equal(finished, true);
    assert.equal(queue.state, 'stopped');
    await assert.rejects(() => queue.start(), /cannot be restarted/);
  });
}

test('[bullmq] a producer that never declares the job reaches a separate consumer', {
  skip: process.env.REDIS_URL ? false : 'set REDIS_URL to run the BullMQ producer/consumer contract',
  timeout: 10_000,
}, async (t) => {
  const options = {
    driver: 'bullmq',
    redisUrl: process.env.REDIS_URL,
    prefix: `test-job-split-${randomUUID()}`,
    defaults: { backoff: 0 },
  };
  const runs = new Map();
  const consumer = createJobQueue(options);
  const producer = createJobQueue(options);
  t.after(() => Promise.all([consumer.stop(), producer.stop()]));

  consumer.define('email', async (_payload, { key }) => runs.set(key, (runs.get(key) ?? 0) + 1));
  await consumer.start();
  // The producer never define()s 'email' and never starts a worker.
  await producer.enqueue('email', { to: 'a@b.c' }, { key: 'welcome:1' });

  await eventually(() => runs.get('welcome:1') === 1);
  assert.equal(runs.get('welcome:1'), 1);
});

test('[bullmq] replicas share work and either one can stop independently', {
  skip: process.env.REDIS_URL ? false : 'set REDIS_URL to run the BullMQ replica contract',
  timeout: 10_000,
}, async (t) => {
  const options = {
    driver: 'bullmq',
    redisUrl: process.env.REDIS_URL,
    prefix: `test-job-fleet-${randomUUID()}`,
    defaults: { backoff: 0 },
  };
  const runs = new Map();
  const handler = async (_payload, { key }) => runs.set(key, (runs.get(key) ?? 0) + 1);
  const replicas = [createJobQueue(options), createJobQueue(options)];
  t.after(() => Promise.all(replicas.map((queue) => queue.stop())));
  for (const replica of replicas) replica.define('shared', handler);
  await Promise.all(replicas.map((queue) => queue.start()));

  await replicas[0].enqueue('shared', {}, { key: 'before-stop' });
  await eventually(() => runs.get('before-stop') === 1);
  await replicas[0].stop();
  await replicas[1].enqueue('shared', {}, { key: 'after-stop' });
  await eventually(() => runs.get('after-stop') === 1);

  assert.deepEqual(Object.fromEntries(runs), {
    'before-stop': 1,
    'after-stop': 1,
  });
});
