import test from 'node:test';
import assert from 'node:assert/strict';
import { queueName } from '../internal/bullmq.js';
import { dedupId } from '../internal/retry.js';
import { createEventBus } from '../events/index.js';
import { subscriberStream } from '../events/internal.js';

test('the driver is explicit and unknown drivers are refused', () => {
  assert.equal(createEventBus().driver, 'memory');
  assert.equal(createEventBus({ driver: 'memory' }).driver, 'memory');
  assert.throws(() => createEventBus({ driver: 'sqs' }), /unknown event bus driver "sqs"/);
});

test('building the bullmq driver validates configuration without connecting', () => {
  const bus = createEventBus({ driver: 'bullmq', redisUrl: 'redis://127.0.0.1:6379' });
  bus.subscribe('user.registered', 'welcome', async () => {}, { concurrency: 4 });

  assert.equal(bus.driver, 'bullmq');
  assert.equal(bus.state, 'idle');
  assert.throws(
    () => bus.subscribe('user.registered', 'welcome', async () => {}),
    /subscriber "welcome" is already declared for event "user.registered"/,
  );
  assert.throws(() => bus.subscribe('e', 's', async () => {}, { concurrency: 0 }), /integer >= 1/);
});

test('the bullmq driver needs a usable URL', () => {
  assert.throws(() => createEventBus({ driver: 'bullmq' }), /requires `redisUrl`/);
  assert.throws(() => createEventBus({ driver: 'bullmq', redisUrl: 'http://x' }), /redis:\/\/ or rediss:\/\//);
});

test('each subscriber of an event gets an isolated stream', () => {
  const welcome = subscriberStream('user.registered', 'welcome');
  const provision = subscriberStream('user.registered', 'provision');

  assert.notEqual(welcome, provision);
  assert.notEqual(dedupId(welcome, 'user:7'), dedupId(provision, 'user:7'));
  assert.notEqual(queueName('app', 'event', welcome), queueName('app', 'event', provision));
});

test('subscribers must be declared before start and publish after it', async () => {
  const bus = createEventBus({ driver: 'memory' });
  await assert.rejects(() => bus.publish('e', {}, { key: 'k' }), /must be started before publish/);

  bus.subscribe('e', 's', async () => {});
  await bus.start();
  assert.throws(() => bus.subscribe('e', 's2', async () => {}), /must be declared before start/);
  await bus.stop();
  await assert.rejects(() => bus.start(), /cannot be restarted/);
});

test('empty names for events and subscribers are refused', () => {
  const bus = createEventBus({ driver: 'memory' });
  assert.throws(() => bus.subscribe('', 's', async () => {}), /a event needs a non-empty name/);
  assert.throws(() => bus.subscribe('e', '', async () => {}), /a subscriber needs a non-empty name/);
  assert.throws(() => bus.subscribe('e', 's', null), /must be a function/);
});

test('publishing with no subscribers is a valid no-op', async () => {
  const bus = createEventBus({ driver: 'memory' });
  bus.subscribe('heard', 's', async () => {});
  await bus.start();

  const result = await bus.publish('unheard', { any: true }, { key: 'k' });

  assert.equal(result.event, 'unheard');
  assert.deepEqual(result.deliveries, []);
  await bus.stop();
});

test('a large publish burst drains in order without quadratic slowdown', async () => {
  const bus = createEventBus({ driver: 'memory' });
  const seen = [];
  const drained = Promise.withResolvers();
  // Backlog far past the 1024 compaction threshold, single lane, so the whole
  // burst queues before any delivery consumes it — the exact shape that a
  // `shift()`-based queue drains in O(n^2).
  const total = 5_000;
  bus.subscribe('burst', 'worker', async (payload) => {
    seen.push(payload.i);
    if (seen.length === total) drained.resolve();
  });
  await bus.start();

  for (let i = 0; i < total; i += 1) await bus.publish('burst', { i }, { key: `k${i}` });
  await drained.promise;

  assert.equal(seen.length, total);
  assert.deepEqual(seen, Array.from({ length: total }, (_, i) => i));
  await bus.stop();
});

test('stop gives running handlers an abort signal', async () => {
  const bus = createEventBus({ driver: 'memory' });
  let observed;
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  bus.subscribe('slow', 'worker', async (_payload, { signal }) => {
    observed = signal;
    started.resolve();
    await release.promise;
  });
  await bus.start();
  await bus.publish('slow', {}, { key: 'one' });
  await started.promise;

  const stopping = bus.stop();
  assert.ok(observed instanceof AbortSignal);
  assert.equal(observed.aborted, true);
  release.resolve();
  await stopping;
  assert.equal(bus.state, 'stopped');
});

test('stop abandons a handler that ignores the signal once the timeout elapses', async () => {
  const bus = createEventBus({ driver: 'memory' });
  const started = Promise.withResolvers();
  bus.subscribe('stuck', 'worker', async () => {
    started.resolve();
    await new Promise(() => {});
  });
  await bus.start();
  await bus.publish('stuck', {}, { key: 'one' });
  await started.promise;

  const before = Date.now();
  await bus.stop({ timeoutMs: 50 });
  const elapsed = Date.now() - before;

  assert.equal(bus.state, 'stopped');
  assert.ok(elapsed < 2_000, `stop should return near the timeout, took ${elapsed}ms`);
});
