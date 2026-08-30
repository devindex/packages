# @devindex/api-kit

## 0.3.1

### Patch Changes

- Document `./cache` in the README: the `createCache()` example, the key, value and TTL rules, why only `delete()` rejects when the store is unreachable, and what each driver guarantees.

## 0.3.0

### Minor Changes

- Add `./cache` — `createCache()` over a `memory` or `redis` driver, with the same contract on both: `get()`, `has()`, `set()`, `delete()` and `wrap()`.

  Values are JSON, and both drivers store the serialized form, so what the memory driver hands back cannot be mutated behind the cache's back. `undefined` is reserved to report a miss and is never stored; `null` is a valid value. Every key lives under the configured `prefix`, and `ttl` (milliseconds, `0` never expires) is set per cache and overridable per write.

  Reads and writes are optimizations, so a broken store degrades: `get()` and `has()` report a miss, `set()` logs and moves on. `delete()` is the exception and propagates — an invalidation that did not happen serves stale data until the TTL runs out, and the caller is the one who can decide what that means.

- Add offset pagination to `./http` — `paginate()` and the `pageResponse()` schema, the pair that closes the contract `pageQuery()` opens.

  The query fetches `limit + 1` rows and `paginate(rows, limit)` slices the extra one off, returning `{ items, hasMore }`. The kit never runs the query, so it works over Mongoose, a SQL builder or an upstream API alike. A resource that needs the count passes it as `paginate(rows, limit, total)` and gets `{ items, hasMore, total }`; `hasMore` still comes from the extra row, never from the count, because the two queries can disagree.

  `pageResponse(itemSchema)` declares that shape as a response schema — `{ total: true }` adds `total` — which Fastify needs in order not to strip the fields from a correct payload.

## 0.2.0

### Minor Changes

- Add `onFatalError()` to `./runtime` — an uncaught exception or unhandled rejection is logged as fatal and the process exits `1`.

  It does not run the shutdown callback: after an uncaught throw the process state is undefined, and a teardown running over it can hang or corrupt what it touches. The logger is flushed before exiting, so a `pretty` transport writing from a worker thread does not lose the line explaining the crash.

- Add `./env` — `createEnvReader()`, a reader over `process.env` that collects every problem instead of failing on the first one, so a misconfigured boot reports all of them at once.

  - `str()`, `int()` and `oneOf()` take `fallback` and `required`, and treat an empty string as an absent value.
  - `issues()` returns the collected problems, leaving the caller to merge them with its own cross-field checks and decide how to fail.
  - The source defaults to `process.env` but is injectable, so a reader can be tested without touching the process.

## 0.1.0

### Minor Changes

- First release of `@devindex/api-kit`: building blocks for Fastify services.

  - `./errors` — `DomainError` with a shared registry brand, error codes and stack relativization.
  - `./http` — `createApp()` plus the request id, request context, raw body, decorator and error handler plugins.
  - `./context` — request-scoped context over `AsyncLocalStorage`.
  - `./log` — pino logger with redaction defaults and an optional pretty transport.
  - `./events`, `./jobs`, `./schedule` — memory and BullMQ drivers behind one contract.
  - `./runtime` — signal handling and graceful shutdown.
