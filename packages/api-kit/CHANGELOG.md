# @devindex/api-kit

## 0.1.0

### Minor Changes

- First release of `@devindex/api-kit`: building blocks for Fastify services.

  - `./errors` — `DomainError` with a shared registry brand, error codes and stack relativization.
  - `./http` — `createApp()` plus the request id, request context, raw body, decorator and error handler plugins.
  - `./context` — request-scoped context over `AsyncLocalStorage`.
  - `./log` — pino logger with redaction defaults and an optional pretty transport.
  - `./events`, `./jobs`, `./schedule` — memory and BullMQ drivers behind one contract.
  - `./runtime` — signal handling and graceful shutdown.
