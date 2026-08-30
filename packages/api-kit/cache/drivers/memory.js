/**
 * In-process store for tests and local runs. Entries expire on read and are lost
 * with the process.
 *
 * @return {object} A store: start, get, has, set, delete and stop.
 */
export function memoryStore() {
  const entries = new Map();

  function read(key) {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== 0 && entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  return {
    async start() {},

    async get(key) {
      return read(key);
    },

    async has(key) {
      return read(key) !== undefined;
    },

    async set(key, value, ttl) {
      entries.set(key, { value, expiresAt: ttl === 0 ? 0 : Date.now() + ttl });
    },

    async delete(key) {
      return entries.delete(key);
    },

    async stop() {
      entries.clear();
    },
  };
}
