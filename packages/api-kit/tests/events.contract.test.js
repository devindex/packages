import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createEventBus } from '../events/index.js';

if (process.env.REQUIRE_REDIS === '1' && !process.env.REDIS_URL) {
  throw new Error('REQUIRE_REDIS=1 needs REDIS_URL');
}

const DRIVERS = [
  { name: 'memory', options: { driver: 'memory' }, skip: false },
  {
    name: 'bullmq',
    options: { driver: 'bullmq', redisUrl: process.env.REDIS_URL, prefix: `test-event-${randomUUID()}` },
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

  const withBus = async (t, body) => {
    const bus = createEventBus(options);
    t.after(() => bus.stop());
    return body(bus);
  };

  suite('a subscriber receives its payload and context', (t) => withBus(t, async (bus) => {
    const done = deferred();
    bus.subscribe('welcome', 'mailer', async (payload, context) => done.resolve({ payload, context }));
    await bus.start();

    const result = await bus.publish('welcome', { userId: 7 }, { key: 'user:7' });
    const seen = await done.promise;

    assert.equal(result.event, 'welcome');
    assert.equal(result.key, 'user:7');
    assert.equal(result.deliveries.length, 1);
    assert.equal(result.deliveries[0].subscriber, 'mailer');
    assert.deepEqual(seen.payload, { userId: 7 });
    assert.equal(seen.context.event, 'welcome');
    assert.equal(seen.context.subscriber, 'mailer');
    assert.equal(seen.context.eventId, result.eventId);
    assert.equal(seen.context.key, 'user:7');
    assert.equal(seen.context.attempt, 1);
    assert.ok(seen.context.signal instanceof AbortSignal);
  }));

  suite('an event fans out to every subscriber once', (t) => withBus(t, async (bus) => {
    const runs = new Map();
    const seen = deferred();
    const mark = (subscriber) => {
      runs.set(subscriber, (runs.get(subscriber) ?? 0) + 1);
      if (runs.size === 2) seen.resolve();
    };
    bus.subscribe('user.registered', 'welcome', async () => mark('welcome'));
    bus.subscribe('user.registered', 'provision', async () => mark('provision'));
    await bus.start();

    const result = await bus.publish('user.registered', { userId: 1 }, { key: 'user:1' });
    await seen.promise;

    assert.equal(result.deliveries.length, 2);
    assert.deepEqual(
      new Set(result.deliveries.map((delivery) => delivery.subscriber)),
      new Set(['welcome', 'provision']),
    );
    await eventually(() => runs.get('welcome') === 1 && runs.get('provision') === 1);
  }));

  suite('one failing subscriber does not stop the others', (t) => withBus(t, async (bus) => {
    const succeeded = deferred();
    bus.subscribe('order.placed', 'always-fails', async () => {
      throw new Error('boom');
    }, { attempts: 1 });
    bus.subscribe('order.placed', 'succeeds', async () => succeeded.resolve());
    await bus.start();

    await bus.publish('order.placed', {}, { key: 'order:1' });
    await succeeded.promise;
  }));

  suite('the same active identity delivers once per subscriber', (t) => withBus(t, async (bus) => {
    const started = deferred();
    const release = deferred();
    let runs = 0;
    bus.subscribe('sync', 'worker', async () => {
      runs += 1;
      started.resolve();
      await release.promise;
    });
    await bus.start();

    const first = await bus.publish('sync', {}, { key: 'k' });
    await started.promise;
    const second = await bus.publish('sync', {}, { key: 'k' });
    release.resolve();

    assert.equal(second.deliveries[0].deliveryId, first.deliveries[0].deliveryId);
    await eventually(() => runs === 1);
  }));

  suite('the same key reaches every subscriber independently', (t) => withBus(t, async (bus) => {
    const seen = new Set();
    const both = deferred();
    const mark = (subscriber) => {
      seen.add(subscriber);
      if (seen.size === 2) both.resolve();
    };
    bus.subscribe('e', 's1', async () => mark('s1'));
    bus.subscribe('e', 's2', async () => mark('s2'));
    await bus.start();

    await bus.publish('e', {}, { key: 'same' });
    await both.promise;

    assert.deepEqual(seen, new Set(['s1', 's2']));
  }));

  suite('failed deliveries retry with a rising attempt number', (t) => withBus(t, async (bus) => {
    const attempts = [];
    const done = deferred();
    bus.subscribe('flaky', 'worker', async (_payload, context) => {
      attempts.push(context.attempt);
      if (context.attempt < 3) throw new Error('not yet');
      done.resolve();
    }, { attempts: 3 });
    await bus.start();

    await bus.publish('flaky', {}, { key: 'once' });
    await done.promise;

    assert.deepEqual(attempts, [1, 2, 3]);
  }));

  suite('subscriber concurrency controls parallel work', (t) => withBus(t, async (bus) => {
    let active = 0;
    let peak = 0;
    let completed = 0;
    const started = deferred();
    const release = deferred();
    const finished = deferred();
    bus.subscribe('parallel', 'worker', async () => {
      active += 1;
      peak = Math.max(peak, active);
      if (peak === 2) started.resolve();
      await release.promise;
      active -= 1;
      completed += 1;
      if (completed === 3) finished.resolve();
    }, { concurrency: 2 });
    await bus.start();

    await Promise.all(['a', 'b', 'c'].map((key) => bus.publish('parallel', {}, { key })));
    await started.promise;
    release.resolve();
    await finished.promise;

    assert.equal(peak, 2);
  }));

  suite('delay postpones delivery', (t) => withBus(t, async (bus) => {
    const done = deferred();
    const before = Date.now();
    bus.subscribe('later', 'worker', async () => done.resolve(Date.now()));
    await bus.start();

    await bus.publish('later', {}, { key: 'one', delay: 40 });
    const ranAt = await done.promise;

    assert.ok(ranAt - before >= 30, `event delivered after ${ranAt - before}ms`);
  }));

  suite('publishing with no subscribers is a no-op and missing keys are refused', (t) => withBus(t, async (bus) => {
    bus.subscribe('known', 'worker', async () => {});
    await bus.start();

    const unheard = await bus.publish('unknown', {}, { key: 'one' });
    assert.deepEqual(unheard.deliveries, []);
    await assert.rejects(() => bus.publish('known', {}, {}), /`key` must be a non-empty string/);
    await assert.rejects(() => bus.publish('known', {}, { key: 123 }), /must be a non-empty string, got number/);
    await assert.rejects(() => bus.publish('known', {}, { key: 'one', delay: -1 }), />= 0 milliseconds/);
  }));

  suite('stop waits for active handlers', async () => {
    const bus = createEventBus(options);
    const started = deferred();
    const release = deferred();
    let finished = false;
    bus.subscribe('slow', 'worker', async () => {
      started.resolve();
      await release.promise;
      finished = true;
    });
    await bus.start();
    await bus.publish('slow', {}, { key: 'one' });
    await started.promise;

    const stopping = bus.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(finished, false);
    release.resolve();
    await stopping;

    assert.equal(finished, true);
    assert.equal(bus.state, 'stopped');
    await assert.rejects(() => bus.start(), /cannot be restarted/);
  });
}
