import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createEventBus } from '../events/index.js';

const skip = process.env.REDIS_URL ? false : 'set REDIS_URL to run the BullMQ event bus integration';

async function eventually(check, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('condition was not met before timeout');
}

test('[bullmq] replicas of a subscriber share its deliveries', { skip, timeout: 10_000 }, async (t) => {
  const options = {
    driver: 'bullmq',
    redisUrl: process.env.REDIS_URL,
    prefix: `test-event-fleet-${randomUUID()}`,
    defaults: { backoff: 0 },
  };
  const runs = new Map();
  const handler = async (_payload, { key }) => runs.set(key, (runs.get(key) ?? 0) + 1);
  const replicas = [createEventBus(options), createEventBus(options)];
  t.after(() => Promise.all(replicas.map((bus) => bus.stop())));
  for (const replica of replicas) replica.subscribe('shared', 'worker', handler);
  await Promise.all(replicas.map((bus) => bus.start()));

  await replicas[0].publish('shared', {}, { key: 'once' });
  await eventually(() => runs.get('once') === 1);

  // A cluster-wide delivery runs once, not once per replica.
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(runs.get('once'), 1);
});

test('[bullmq] an event fans out to independent durable subscriber queues', { skip, timeout: 10_000 }, async (t) => {
  const options = {
    driver: 'bullmq',
    redisUrl: process.env.REDIS_URL,
    prefix: `test-event-fanout-${randomUUID()}`,
    defaults: { backoff: 0 },
  };
  const bus = createEventBus(options);
  t.after(() => bus.stop());
  const runs = new Map();
  const mark = (subscriber) => runs.set(subscriber, (runs.get(subscriber) ?? 0) + 1);
  // One subscriber fails permanently; the other must still be delivered from its
  // own queue, proving the streams are isolated across the Redis boundary.
  bus.subscribe('user.registered', 'always-fails', async () => {
    mark('always-fails');
    throw new Error('boom');
  }, { attempts: 1 });
  bus.subscribe('user.registered', 'welcome', async () => mark('welcome'));
  await bus.start();

  const result = await bus.publish('user.registered', { userId: 1 }, { key: 'user:1' });
  assert.equal(result.deliveries.length, 2);

  await eventually(() => runs.get('welcome') === 1 && runs.get('always-fails') === 1);
});
