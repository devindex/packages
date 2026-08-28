# @devindex/api-kit

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
