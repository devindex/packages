export async function loadIoredis() {
  try {
    return await import('ioredis');
  } catch (error) {
    if (['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(error?.code)) {
      throw new Error('Redis support requires `ioredis`: install the package', { cause: error });
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
