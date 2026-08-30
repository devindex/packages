import test from 'node:test';
import assert from 'node:assert/strict';
import { queueName } from '../internal/bullmq.js';
import { redisConnection } from '../internal/redis.js';
import { createJobQueue } from '../jobs/index.js';
import { backoffDelay, dedupId, DEFAULTS, resolveDefinition } from '../internal/retry.js';

test('the driver is explicit and unknown drivers are refused', () => {
  assert.equal(createJobQueue().driver, 'memory');
  assert.equal(createJobQueue({ driver: 'memory' }).driver, 'memory');
  assert.throws(() => createJobQueue({ driver: 'sqs' }), /unknown job driver "sqs"/);
});

test('a large enqueue burst drains in order without quadratic slowdown', async () => {
  const queue = createJobQueue({ driver: 'memory' });
  const seen = [];
  const drained = Promise.withResolvers();
  // Backlog far past the 1024 compaction threshold, single lane, so the whole
  // burst queues before any run consumes it — the exact shape that a
  // `shift()`-based queue drains in O(n^2).
  const total = 5_000;
  queue.define('burst', async (payload) => {
    seen.push(payload.i);
    if (seen.length === total) drained.resolve();
  });
  await queue.start();

  for (let i = 0; i < total; i += 1) await queue.enqueue('burst', { i }, { key: `k${i}` });
  await drained.promise;

  assert.equal(seen.length, total);
  assert.deepEqual(seen, Array.from({ length: total }, (_, i) => i));
  await queue.stop();
});

test('building the bullmq driver validates configuration without connecting', () => {
  const queue = createJobQueue({ driver: 'bullmq', redisUrl: 'redis://127.0.0.1:6379' });
  queue.define('welcome', async () => {}, { concurrency: 4 });

  assert.equal(queue.driver, 'bullmq');
  assert.equal(queue.state, 'idle');
  assert.throws(() => queue.define('welcome', async () => {}), /already declared/);
  assert.throws(() => queue.define('bad', async () => {}, { concurrency: 0 }), /integer >= 1/);
});

test('the bullmq driver needs a usable URL', () => {
  assert.throws(() => createJobQueue({ driver: 'bullmq' }), /requires `redisUrl`/);
  assert.throws(() => createJobQueue({ driver: 'bullmq', redisUrl: 'http://x' }), /redis:\/\/ or rediss:\/\//);
  assert.throws(() => createJobQueue({ driver: 'bullmq', redisUrl: 'not a url' }), /invalid redisUrl/);
});

test('redis connections carry credentials, database, TLS and worker retry policy', () => {
  assert.deepEqual(redisConnection('redis://127.0.0.1:6379'), {
    host: '127.0.0.1',
    port: 6379,
    db: 0,
    maxRetriesPerRequest: 1,
  });
  assert.equal(redisConnection('redis://127.0.0.1', { worker: true }).maxRetriesPerRequest, null);

  const secure = redisConnection('rediss://user:p%40ss@cache.example:6380/3');
  assert.equal(secure.db, 3);
  assert.equal(secure.password, 'p@ss');
  assert.deepEqual(secure.tls, {});
});

test('queue names are valid, readable and collision resistant', () => {
  const first = queueName('billing api', 'job', 'invoice.send');
  const second = queueName('billing api', 'job', 'invoice/send');

  assert.match(first, /^billing-api-[a-f0-9]{10}-job-invoice-send-[a-f0-9]{10}$/);
  assert.notEqual(first, second);
  assert.ok(!first.includes(':'));
});

test('definition options override queue defaults', () => {
  assert.deepEqual(resolveDefinition(DEFAULTS), DEFAULTS);
  assert.equal(resolveDefinition(DEFAULTS, { attempts: 2 }).attempts, 2);
  assert.equal(resolveDefinition(DEFAULTS, { concurrency: 4 }).concurrency, 4);
  assert.throws(() => resolveDefinition(DEFAULTS, { attempts: 0 }), /integer >= 1/);
  assert.throws(() => resolveDefinition(DEFAULTS, { backoff: { type: 'other', delay: 1 } }), /backoff must/);
});

test('backoff supports fixed and exponential delays', () => {
  assert.equal(backoffDelay(500, 3), 500);
  assert.equal(backoffDelay({ type: 'fixed', delay: 200 }, 3), 200);
  assert.deepEqual(
    [1, 2, 3].map((attempt) => backoffDelay({ type: 'exponential', delay: 100 }, attempt)),
    [100, 200, 400],
  );
});

test('identity includes both name and key', () => {
  assert.equal(dedupId('a', 'b'), dedupId('a', 'b'));
  assert.notEqual(dedupId('a', 'b'), dedupId('b', 'a'));
  assert.notEqual(dedupId('a:b', 'c'), dedupId('a', 'b:c'));
});

test('stop gives running handlers an abort signal', async () => {
  const queue = createJobQueue({ driver: 'memory' });
  let observed;
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  queue.define('slow', async (_payload, { signal }) => {
    observed = signal;
    started.resolve();
    await release.promise;
  });
  await queue.start();
  await queue.enqueue('slow', {}, { key: 'one' });
  await started.promise;

  const stopping = queue.stop();
  assert.ok(observed instanceof AbortSignal);
  assert.equal(observed.aborted, true);
  release.resolve();
  await stopping;
  assert.equal(queue.state, 'stopped');
});

test('stop abandons a handler that ignores the signal once the timeout elapses', async () => {
  const queue = createJobQueue({ driver: 'memory' });
  const started = Promise.withResolvers();
  // Never resolves and never observes `signal`: only the deadline can end stop().
  queue.define('stuck', async () => {
    started.resolve();
    await new Promise(() => {});
  });
  await queue.start();
  await queue.enqueue('stuck', {}, { key: 'one' });
  await started.promise;

  const before = Date.now();
  await queue.stop({ timeoutMs: 50 });
  const elapsed = Date.now() - before;

  assert.equal(queue.state, 'stopped');
  assert.ok(elapsed < 2_000, `stop should return near the timeout, took ${elapsed}ms`);
});
