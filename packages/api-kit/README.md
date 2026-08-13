# @devindex/api-kit

Building blocks for backend services. Factories are inert until `start()` and never select a
driver from the environment.

## Installation

```bash
npm install @devindex/api-kit
```

Node `>=22`. The memory drivers need no external service. BullMQ drivers load their optional peers
only on first use:

```bash
npm install bullmq ioredis
```

## `./errors`

`DomainError` and its subtypes carry a code and details. The HTTP status is optional: the kit's own
codes are mapped by the HTTP layer, so an error thrown in a queue or CLI need not know about HTTP.

```js
throw new ConflictError('email already registered', {
  details: [{ field: 'email' }],
});
```

An app defines its own errors by extending `DomainError` with a code of its own. `STATUS_BY_CODE`
cannot know that code, so declare the status where the error is defined — otherwise every app error
answers 400:

```js
class PaymentDeclinedError extends DomainError {
  constructor(message = 'Payment declined', options = {}) {
    super(message, { ...options, code: 'PAYMENT_DECLINED', status: 402 });
  }
}
```

`status` is set only when given, so an error that never meets HTTP carries no trace of it. Subtypes
pin their code but not their status, so `new NotFoundError('order archived', { status: 410 })` works.

| Error | Code |
|---|---|
| `ValidationError` | `VALIDATION_ERROR` |
| `AuthError` | `UNAUTHORIZED` |
| `ForbiddenError` | `FORBIDDEN` |
| `NotFoundError` | `NOT_FOUND` |
| `MethodNotAllowedError` | `METHOD_NOT_ALLOWED` |
| `ConflictError` | `CONFLICT` |
| `LimitError` | `LIMIT_REACHED` |
| `PayloadError` | `PAYLOAD_TOO_LARGE` |
| `TooManyRequestsError` | `TOO_MANY_REQUESTS` |
| `UnavailableError` | `UNAVAILABLE` |
| `DomainError` | `DOMAIN_ERROR` |

Use `isDomainError(error)` instead of `instanceof`. The brand crosses multiple installed copies of
the package and stays out of serialized responses and logs.

## `./http`

`createApp()` builds the full Fastify stack and returns it **without listening**, so tests drive it
with `app.inject()` and starting the server stays the entrypoint's job. Every failure — a
`DomainError`, a schema rejection, an unexpected throw — leaves through one envelope:

```js
import { createApp } from '@devindex/api-kit/http';

const app = await createApp({
  logger,
  routes: async (instance) => {
    instance.get('/orders/:id', async (req) => orders.find(req.params.id));
  },
});

await app.listen({ port: 3000 });
```

A `ConflictError('email already registered')` becomes:

```json
{ "error": { "code": "CONFLICT", "message": "email already registered", "details": [], "requestId": "…" } }
```

The status is the error's own `status` when it has one, otherwise `STATUS_BY_CODE[code]`, otherwise
400. Unclassified errors are logged and masked as a 500 that never leaks the original message. `createApp` options:

| Option | Default | Purpose |
|---|---|---|
| `logger` | none | A base pino instance; the kit types the lines itself (see below). Omitted disables Fastify logging |
| `context` | none | A `./context` store; omitted disables async context |
| `cors` | on (`origin: true`) | `@fastify/cors` options; pass `false` to disable |
| `helmet` | on (CSP off) | `@fastify/helmet` options; pass `false` to disable |
| `routes` | none | The app's route plugin, registered last |
| `plugins` | `[]` | Extra plugins `Function` or `[Function, options]`, in order |
| `requestProperties` | `{}` | Request decorators — the app's own vocabulary |
| `captureRawBody` | `false` | Keep the exact bytes on `req.rawBody` for webhook signatures |
| `ajvPlugins` / `ajvOptions` | `[]` / `{}` | ajv plugins and merged custom options |
| `genReqId` | kit default | Correlation id strategy |
| `fastify` | `{}` | Merged last into the Fastify constructor options |

Inbound `x-request-id` is reused only when it is a valid UUID, otherwise a fresh v4 is generated; the
id is always echoed back. `schema.js` ships ODM-agnostic JSON-Schema helpers — `objectSchema`,
`stringSchema`, `pageQuery`, `email`, `dateTime`, `dateKey`, `clock`.

### CORS and security headers

**CORS is on by default** with `origin: true`, reflecting the caller's origin, because a browser-facing
API almost always needs it. It registers before the routes.

```js
// Default: reflects any origin, no cookies.
await createApp({ routes });

// Server-to-server or same-origin app: turn it off.
await createApp({ cors: false, routes });
```

> **Footgun:** the default `origin: true` must **not** be combined with `credentials: true` — that
> lets any site read an authenticated response. A cookie/credentialed API must override `origin` with
> an explicit allowlist, which also makes non-listed origins get no CORS header at all:
>
> ```js
> await createApp({ cors: { origin: ['https://app.example.com'], credentials: true }, routes });
> ```

**`helmet` is on by default with `contentSecurityPolicy: false`.** CSP is a browser directive for
rendered documents — inert on JSON responses, and its default breaks any HTML tooling bolted onto the
API (Swagger, GraphQL playground, HTML error pages). The other headers (`X-Content-Type-Options:
nosniff`, frameguard, HSTS…) stay on.

```js
// Default: security headers on, CSP off.
await createApp({ routes });

// Turn it off entirely.
await createApp({ helmet: false, routes });

// An endpoint serving HTML re-enables CSP with its own policy.
await createApp({ helmet: { contentSecurityPolicy: { useDefaults: true } }, routes });
```

Anything else — rate limits, compression — still goes through `plugins`, which registers after these
and before the routes.

## `./context`

An isolated `AsyncLocalStorage` store, owned by the service, so two services in one process never
leak each other's request metadata. It is **opt-in**: pass it to `createApp({ context })` and the
HTTP layer propagates `requestId`/`correlationId` below itself, readable in the service layer without
threading them through every call.

```js
import { createContextStore, serializableContext } from '@devindex/api-kit/context';

const context = createContextStore();
const app = await createApp({ context, routes });

// deeper in a use case:
const log = context.logger(logger); // child logger bound to the correlation id
```

`serializableContext(context.get())` keeps only the correlation fields, which is what should cross a
queue boundary into an event or job.

## `./log`

`createLogger()` builds a [pino](https://getpino.io) instance shaped for later analysis: JSON to
stdout, secret keys redacted, and every line ready to carry a `type` discriminator so a log store can
split request, event, job and integration lines apart. `pino` is an optional peer — install it (and
`pino-pretty` for local pretty-printing) only when you use this module:

```bash
npm install pino
```

```js
import { createLogger, LOG_TYPE, withType } from '@devindex/api-kit/log';

const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'orders' },
  context, // the ./context store — stamps requestId/correlationId on every line
  pretty: process.env.NODE_ENV !== 'production',
});

// Category a scope once; every line from it inherits the type and bindings.
withType(logger, LOG_TYPE.INTEGRATION, { provider: 'stripe' })
  .info({ durationMs, status }, 'charge created');
```

`LOG_TYPE` is the closed vocabulary for the `type` field — `request`, `event`, `job`, `schedule`,
`integration`, `lifecycle`. Filtering then reads naturally: `type:integration AND level>=50` is every
integration error. Pass the same instance — the base one, never a `withType` child — to
`createApp({ logger })`: the HTTP layer is the one place a single logger emits two categories, so the
kit types them itself. What the Fastify instance says (`Server listening at…`, plugin warnings) is
`lifecycle`; what a request says (`incoming request`, `request completed`, the error envelope) is
`request`.

Secrets are redacted at logger creation, never at the call site: `DEFAULT_REDACT_PATHS` covers
`password`, `token`, `authorization`, `cookie` and friends across three nesting levels. Logging
`{ err }` runs pino's error serializer by default, yielding `type`/`message`/`stack`.

### Transports

`transport` is passed straight through to pino, so any target or fan-out works — a file, a service,
or several at once. It takes precedence over `pretty`:

```js
// One line to two sinks: pretty on the console, JSON to a file.
const logger = createLogger({
  transport: {
    targets: [
      { target: 'pino-pretty', options: { destination: 1 } },
      { target: 'pino/file', options: { destination: './logs/app.log' }, level: 'warn' },
    ],
  },
});
```

In production, prefer the default JSON on stdout and let your collector (Datadog agent, Vector,
Fluent Bit…) ship it — skip `pretty` there. A `transport` cannot combine with a `destination` stream;
passing both throws.

## `./events`

Publish/subscribe with fan-out: one published event is delivered to every named
subscriber independently. Unlike a job, an event has no single consumer — a
publisher does not know or wait for who reacts.

```js
import { createEventBus } from '@devindex/api-kit/events';

const bus = createEventBus({
  driver: 'bullmq',
  redisUrl,
  prefix: 'billing',
  logger,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
  },
});

bus.subscribe('user.registered', 'send-welcome', async ({ userId }, { key, log }) => {
  await mailer.welcome(userId, { idempotencyKey: key });
  log.info({ userId }, 'welcome sent');
}, { concurrency: 5 });

bus.subscribe('user.registered', 'provision-workspace', async ({ userId }) => {
  await workspaces.provision(userId);
});

await bus.start();
await bus.publish('user.registered', { userId }, {
  key: `user:${userId}`,
  delay: 0,
});
await bus.stop();
```

Subscribers must be declared before `start()`. A subscriber has a **stable name**
that is unique per event; declaring several subscribers on the same event is how
fan-out happens. Bus defaults can be overridden per subscriber with `attempts`,
`backoff` and `concurrency`; a publish only carries the required logical `key` and
an optional `delay`.

The handler context is:

```js
{ event, subscriber, eventId, key, attempt, attemptsLeft, signal, log }
```

`signal` aborts when `stop()` begins draining, per subscriber delivery; a long
handler should observe it.

`publish()` returns `{ eventId, event, key, deliveries }`, where `deliveries` lists
one `{ subscriber, deliveryId }` per subscriber reached. Publishing an event with no
subscribers is a valid no-op that returns an empty `deliveries` list.

### Identity

Each subscriber is an independent stream: the same event and key deliver once per
subscriber while that delivery is waiting, delayed, active or retrying, and the
identity is released after success or final failure. Two subscribers of the same
event never share a queue and never collapse each other's deliveries, so one
subscriber failing and retrying never blocks another.

Handlers must remain idempotent. Each subscriber gets at-least-once delivery: a
process can finish the external effect and die before acknowledging the delivery.

### Driver guarantees

| | `memory` | `bullmq` |
|---|---|---|
| External service | None | Redis |
| Multiple replicas | One private bus per replica | One distributed queue per subscriber |
| Survives restart | No | Yes |
| Stalled redelivery | No | Yes |
| Deduplication scope | Process | Cluster |
| Fan-out isolation | Per process | One durable queue per subscriber |

The bullmq driver keeps one BullMQ queue and worker per `(event, subscriber)` pair,
so each subscriber is a durable consumer group. Every replica declares the same
subscribers; BullMQ routes each delivery to one worker within a subscriber, with
no elected leader. The memory driver is for development, tests and single-process
workloads.

## `./jobs`

Background work with one deliberately small contract:

```js
import { createJobQueue } from '@devindex/api-kit/jobs';

const jobs = createJobQueue({
  driver: 'bullmq',
  redisUrl,
  prefix: 'billing',
  logger,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
  },
});

jobs.define('send-receipt', async ({ orderId }, { key, log }) => {
  await mailer.send(orderId, { idempotencyKey: key });
  log.info({ orderId }, 'receipt sent');
}, { concurrency: 5 });

await jobs.start();
await jobs.enqueue('send-receipt', { orderId }, {
  key: `receipt:${orderId}`,
  delay: 0,
});
await jobs.stop();
```

Jobs must be declared before `start()` and only declared names can be enqueued. Queue defaults can
be overridden by a definition with `attempts`, `backoff` and `concurrency`; an enqueue only carries
the required logical `key` and an optional `delay`.

The handler context is:

```js
{ name, jobId, key, attempt, attemptsLeft, signal, log }
```

`signal` aborts when `stop()` begins draining; a long handler should observe it.

`idle()` resolves when no job is delayed, queued or running. Both drivers expose the
same behavior, so tests and local tools do not need to know which backend is active.

### Identity

The same name and key produce one job while that job is waiting, delayed, active or retrying. The
identity is released after success or final failure. Permanent idempotency belongs in the database
that commits the external effect.

Handlers must remain idempotent. A durable queue provides at-least-once delivery: a process can
finish the external effect and die before acknowledging the job.

### Driver guarantees

| | `memory` | `bullmq` |
|---|---|---|
| External service | None | Redis |
| Multiple replicas | One private queue per replica | One distributed queue |
| Survives restart | No | Yes |
| Stalled redelivery | No | Yes |
| Deduplication scope | Process | Cluster |

The memory driver is for development, tests and basic single-process workloads. It can run in many
replicas, but each replica processes only the jobs enqueued into that process.

## `./schedule`

Cron is independent from jobs. A schedule can execute a use case directly or enqueue a job by
closing over a queue owned by the application.

```js
import { createSchedule } from '@devindex/api-kit/schedule';

const schedule = createSchedule({
  driver: 'bullmq',
  redisUrl,
  prefix: 'billing',
  logger,
});

schedule.define(
  'daily-settlement',
  { pattern: '0 0 3 * * *', timeZone: 'America/Sao_Paulo' },
  async ({ signal, log }) => settle({ signal, log }),
);

await schedule.start();
```

The pattern supports the six-field cron form, with seconds first; the standard
five-field form works too. The handler receives:

```js
{ name, signal, log }
```

`list()` returns local declarations. `remove(name)` stops a local clock or explicitly removes the
corresponding BullMQ Job Scheduler. `stop()` never removes Redis schedulers because one replica
cannot know whether another still serves them.

### Driver guarantees

| | `memory` | `bullmq` |
|---|---|---|
| Clock | Croner in each process | BullMQ Job Scheduler |
| Multiple replicas | One run per replica | One cluster run per occurrence |
| Survives restart | No | Yes |
| Overlap of the same schedule | Skipped per process | Globally serialized |
| Window with no replicas | Missed | One delayed run remains |

Every Redis replica upserts the same scheduler and starts an equivalent Worker. There is no elected
leader; BullMQ coordinates which Worker receives each occurrence. A new occurrence is produced when
the previous one starts, so global concurrency serializes slow runs rather than overlapping them.

## `./runtime`

`onShutdown` wires `SIGINT`/`SIGTERM` to a teardown callback and exits — the one
lifecycle step services forget. It owns only the signal, running once and the exit
code; the order of teardown and which components to stop stay yours, so any subset
is just the calls you put in the callback.

```js
import { onShutdown } from '@devindex/api-kit/runtime';

onShutdown(async () => {
  await app.close();               // stop accepting HTTP first
  await Promise.allSettled([       // then drain the consumers behind it
    jobs.stop({ timeoutMs: 10_000 }),
    bus.stop({ timeoutMs: 10_000 }),
    schedule.stop(),
  ]);
}, { logger });
```

A second signal arriving mid-drain is a no-op. A `close` that throws exits `1` after
logging; one that hangs past `timeoutMs` (default `10_000`) force-exits `1` so a stuck
drain cannot wedge the process. `signals` defaults to `['SIGINT', 'SIGTERM']`.

## Tests

The default suite exercises every memory path and skips integration tests when Redis is absent:

```bash
npm test -w @devindex/api-kit
```

Redis is mandatory in the integration command and in CI:

```bash
REDIS_URL=redis://127.0.0.1:6379 npm run test:redis -w @devindex/api-kit
```

## License

MIT
