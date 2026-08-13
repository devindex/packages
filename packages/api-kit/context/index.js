import { AsyncLocalStorage } from 'node:async_hooks';

const EMPTY_CONTEXT = Object.freeze({});

/**
 * Creates an isolated async context store.
 *
 * @return {{get: Function, run: Function}}
 *   Frozen accessor bound to its own AsyncLocalStorage.
 */
export function createContextStore() {
  // A service owns its store, so two services in one process never leak
  // request or background-work metadata across each other.
  const storage = new AsyncLocalStorage();

  function get() {
    return storage.getStore() ?? EMPTY_CONTEXT;
  }

  function run(values, callback, ...args) {
    const parent = get();
    return storage.run(Object.freeze({ ...parent, ...values }), callback, ...args);
  }

  return Object.freeze({ get, run });
}

/**
 * Extracts the context fields safe to carry across a queue boundary.
 *
 * @param {Record<string, unknown>} [context]
 * @return {{requestId?: string, correlationId?: string}} Non-empty string fields only.
 */
export function serializableContext(context = {}) {
  const result = {};
  // Only correlation fields cross a queue boundary.
  for (const key of ['requestId', 'correlationId']) {
    if (typeof context[key] === 'string' && context[key].length > 0) {
      result[key] = context[key];
    }
  }
  return result;
}
