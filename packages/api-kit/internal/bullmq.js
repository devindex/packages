import { createHash } from 'node:crypto';

export async function loadBullmq() {
  try {
    return await import('bullmq');
  } catch (error) {
    if (['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(error?.code)) {
      throw new Error(
        'BullMQ support requires `bullmq` and `ioredis`: install both packages',
        { cause: error },
      );
    }
    throw error;
  }
}

export function redisConnection(redisUrl, { worker = false } = {}) {
  if (!redisUrl) throw new Error('a Redis connection requires `redisUrl`');
  let url;
  try {
    url = new URL(redisUrl);
  } catch (error) {
    throw new Error(`invalid redisUrl: ${redisUrl}`, { cause: error });
  }
  if (!['redis:', 'rediss:'].includes(url.protocol)) {
    throw new Error(`redisUrl must use redis:// or rediss://, got ${url.protocol}`);
  }
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isInteger(db) || db < 0) throw new Error(`invalid Redis database in ${redisUrl}`);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    db,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    // BullMQ workers refuse to start unless this is null; producers fail fast.
    maxRetriesPerRequest: worker ? null : 1,
  };
}

function safeSegment(value) {
  const source = String(value);
  // Slugifying is lossy; the hash suffix keeps the queue name unique.
  const readable = source.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'work';
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 10);
  return `${readable.slice(0, 40)}-${hash}`;
}

export function queueName(prefix, kind, name) {
  return `${safeSegment(prefix)}-${kind}-${safeSegment(name)}`;
}
