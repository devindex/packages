import { noopLogger } from '../../internal/logger.js';
import { loadIoredis, redisConnection } from '../../internal/redis.js';

/**
 * Shared store on Redis, with expiration owned by Redis itself.
 *
 * @param {object} options
 * @param {string} options.redisUrl
 * @param {object} [options.logger]
 * @return {object} A store: start, get, has, set, delete and stop.
 */
export function redisStore({ redisUrl, logger = noopLogger } = {}) {
  const connection = redisConnection(redisUrl);
  let client;

  return {
    async start() {
      const { default: Redis } = await loadIoredis();
      client = new Redis(connection);
      // ioredis emits 'error' on the client, and an EventEmitter with no 'error'
      // listener throws: a dropped connection would kill the process the cache
      // is only supposed to make faster.
      client.on('error', (error) => logger.warn({ err: error }, 'cache connection error'));
    },

    async get(key) {
      const value = await client.get(key);
      return value === null ? undefined : value;
    },

    async has(key) {
      return await client.exists(key) > 0;
    },

    async set(key, value, ttl) {
      if (ttl === 0) await client.set(key, value);
      else await client.set(key, value, 'PX', ttl);
    },

    async delete(key) {
      return await client.del(key) > 0;
    },

    async stop() {
      if (!client) return;
      const closing = client;
      client = undefined;
      // quit() rejects when the connection is already down; the socket still has
      // to be released, or shutdown hangs on a Redis that died first.
      await closing.quit().catch(() => closing.disconnect());
    },
  };
}
