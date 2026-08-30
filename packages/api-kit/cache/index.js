import { noopLogger } from '../internal/logger.js';
import { assertDuration, assertHandler, assertKey } from '../internal/validation.js';
import { memoryStore } from './drivers/memory.js';
import { redisStore } from './drivers/redis.js';

const STORES = { memory: memoryStore, redis: redisStore };

/**
 * Creates a process-local or Redis-backed cache. Reads and writes degrade to a
 * miss when the store fails; only `delete()` propagates, because a failed
 * invalidation keeps serving stale data.
 *
 * @param {object} [options]
 * @param {'memory'|'redis'} [options.driver='memory']
 * @param {string} [options.redisUrl] - Required by the redis driver.
 * @param {string} [options.prefix='app'] - Namespace every key is stored under.
 * @param {number} [options.ttl=0] - Default lifetime in milliseconds; 0 never expires.
 * @param {object} [options.logger]
 * @return {object} The cache, not yet started; call start() first.
 */
export function createCache({
  driver = 'memory',
  redisUrl,
  prefix = 'app',
  ttl = 0,
  logger = noopLogger,
} = {}) {
  const createStore = STORES[driver];
  if (!createStore) {
    throw new Error(`unknown cache driver "${driver}", expected ${Object.keys(STORES).join(' or ')}`);
  }
  const defaultTtl = assertDuration('ttl', ttl);
  const store = createStore({ redisUrl, logger });
  let state = 'idle';

  function scope(key, action) {
    if (state !== 'started') throw new Error(`the cache must be started before ${action}()`);
    return `${prefix}:${assertKey(key)}`;
  }

  /**
   * Reads a cached value.
   *
   * @param {string} key
   * @return {Promise<*>} The stored value, or `undefined` on a miss.
   */
  async function get(key) {
    const scoped = scope(key, 'get');
    try {
      const stored = await store.get(scoped);
      return stored === undefined ? undefined : JSON.parse(stored);
    } catch (error) {
      logger.warn({ err: error, key: scoped }, 'cache read failed');
      return undefined;
    }
  }

  /**
   * Whether a live entry exists, without transferring or parsing its value.
   *
   * @param {string} key
   * @return {Promise<boolean>}
   */
  async function has(key) {
    const scoped = scope(key, 'has');
    try {
      return await store.has(scoped);
    } catch (error) {
      logger.warn({ err: error, key: scoped }, 'cache read failed');
      return false;
    }
  }

  /**
   * Stores a value, replacing any entry under the same key.
   *
   * @param {string} key
   * @param {*} value - Must be JSON-serializable; `undefined` is how a miss is reported.
   * @param {object} [options]
   * @param {number} [options.ttl] - Overrides the cache default, in milliseconds.
   * @return {Promise<void>}
   */
  async function set(key, value, { ttl: entryTtl = defaultTtl } = {}) {
    const scoped = scope(key, 'set');
    assertDuration('ttl', entryTtl);
    // Both drivers store the serialized form, so a caller cannot mutate what the
    // memory driver handed back and see the redis driver behave differently.
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError('a cache value must be JSON-serializable and not `undefined`');
    }
    try {
      await store.set(scoped, serialized, entryTtl);
    } catch (error) {
      logger.warn({ err: error, key: scoped }, 'cache write failed');
    }
  }

  /**
   * Drops a cached value. Failures propagate: the caller decides what an
   * invalidation that did not happen means for its request.
   *
   * @param {string} key
   * @return {Promise<boolean>} True when an entry was removed.
   */
  async function remove(key) {
    return store.delete(scope(key, 'delete'));
  }

  /**
   * Reads a cached value, or produces it with `loader` and stores it.
   *
   * @param {string} key
   * @param {() => (*|Promise<*>)} loader - Runs only on a miss; `undefined` is not cached.
   * @param {object} [options]
   * @param {number} [options.ttl] - Overrides the cache default, in milliseconds.
   * @return {Promise<*>} The cached or freshly loaded value.
   */
  async function wrap(key, loader, { ttl: entryTtl = defaultTtl } = {}) {
    scope(key, 'wrap');
    assertHandler(key, loader);
    const cached = await get(key);
    if (cached !== undefined) return cached;
    const value = await loader();
    if (value !== undefined) await set(key, value, { ttl: entryTtl });
    return value;
  }

  async function start() {
    if (state === 'started') return;
    if (state === 'stopped') throw new Error('a stopped cache cannot be restarted');
    await store.start();
    state = 'started';
  }

  async function stop() {
    if (state === 'stopped') return;
    await store.stop();
    state = 'stopped';
  }

  return Object.freeze({
    driver,
    get,
    has,
    set,
    delete: remove,
    wrap,
    start,
    stop,
    get state() {
      return state;
    },
  });
}
