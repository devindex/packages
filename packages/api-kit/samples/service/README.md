# Sample service

A small but complete service wired from the kit: HTTP routes, a background job,
an event with fan-out, a cron schedule, the single error envelope and a graceful
shutdown. Each concern lives in its own file.

| File | Responsibility |
|---|---|
| `logger.js` | A structured console logger (stands in for pino). |
| `domain.js` | In-memory order store and fake side effects. Swap for real ones. |
| `infra.js` | Builds the inert factories: context, jobs, bus, schedule. |
| `jobs.js` | Declares the `send-receipt` job. |
| `events.js` | Declares the `order.placed` subscribers (fan-out). |
| `schedule.js` | Declares the `settlement` cron. |
| `routes.js` | The route plugin; throws domain errors, publishes the event. |
| `app.js` | `createApp` — assembles the HTTP stack without listening. |
| `server.js` | Entrypoint: declare → start → listen → `onShutdown`. |

## Run

In memory, no external service:

```bash
node packages/api-kit/samples/service/server.js
```

Durable and cluster-wide, backed by Redis (needs `npm i ioredis bullmq`):

```bash
REDIS_URL=redis://127.0.0.1:6379 node packages/api-kit/samples/service/server.js
```

## Try it

Place an order — one `order.placed` fans out to the receipt job and the
analytics subscriber, and the settlement cron logs every ten seconds:

```bash
curl -sX POST localhost:3000/orders -H 'content-type: application/json' -d '{"orderId":"A1"}'
# → 201 {"orderId":"A1"}
```

The same order again hits the uniqueness invariant — the error leaves through
the envelope, mapped to 409:

```bash
curl -sX POST localhost:3000/orders -H 'content-type: application/json' -d '{"orderId":"A1"}'
# → 409 {"error":{"code":"CONFLICT","message":"order already placed","details":[{"field":"orderId"}],"requestId":"…"}}
```

Fetch it, and fetch one that does not exist (404, message preserved):

```bash
curl -s localhost:3000/orders/A1
curl -s localhost:3000/orders/NOPE
# → 404 {"error":{"code":"NOT_FOUND","message":"order not found","details":[],"requestId":"…"}}
```

Press `Ctrl+C`: `onShutdown` closes HTTP first, then drains the consumers, and
exits.
