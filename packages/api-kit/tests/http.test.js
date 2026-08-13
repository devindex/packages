import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { createContextStore } from '../context/index.js';
import {
  ConflictError,
  DomainError,
  MethodNotAllowedError,
  NotFoundError,
  PayloadError,
  TooManyRequestsError,
} from '../errors/index.js';
import { createApp, objectSchema, REQUEST_ID_HEADER } from '../http/index.js';
import { createLogger, LOG_TYPE } from '../log/index.js';

// Collects each line pino writes, parsed and raw — the raw form is what proves a
// binding was replaced rather than appended.
function sink() {
  const lines = [];
  const raw = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      raw.push(chunk.toString());
      lines.push(JSON.parse(raw.at(-1)));
      done();
    },
  });
  return { stream, lines, raw };
}

test('createApp builds without listening and returns the standard error envelope', async (t) => {
  const app = await createApp({
    routes: async (instance) => {
      instance.get('/conflict', async () => {
        throw new ConflictError('already exists', { details: [{ field: 'email' }] });
      });
      instance.get('/limited', async () => {
        throw new TooManyRequestsError();
      });
      instance.post('/payload', async () => {
        throw new PayloadError();
      });
      instance.post('/method-not-allowed', async () => {
        throw new MethodNotAllowedError();
      });
    },
  });
  t.after(() => app.close());

  await app.ready();
  assert.equal(app.server.listening, false);

  const response = await app.inject('/conflict');
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json().error, {
    code: 'CONFLICT',
    message: 'already exists',
    details: [{ field: 'email' }],
    requestId: response.headers[REQUEST_ID_HEADER],
  });
  assert.equal((await app.inject('/limited')).statusCode, 429);
  assert.equal((await app.inject({ method: 'POST', url: '/payload' })).statusCode, 413);
  assert.equal((await app.inject({ method: 'POST', url: '/method-not-allowed' })).statusCode, 405);
});

test('a schema rejection and a bare HTTP status keep code and status in agreement', async (t) => {
  const app = await createApp({
    routes: async (instance) => {
      instance.post('/orders', {
        schema: { body: objectSchema({ value: { type: 'integer' } }, ['value']) },
      }, async () => 'ok');
      instance.get('/forbidden', async () => {
        throw Object.assign(new Error('nope'), { statusCode: 403 });
      });
    },
  });
  t.after(() => app.close());

  const invalid = await app.inject({
    method: 'POST',
    url: '/orders',
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(invalid.statusCode, 422, 'a schema rejection shares VALIDATION_ERROR status');
  assert.equal(invalid.json().error.code, 'VALIDATION_ERROR');

  const forbidden = await app.inject('/forbidden');
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.json().error.code, 'FORBIDDEN', 'the code follows the status, not VALIDATION_ERROR');
});

test('an app error carries its own status, and an unmapped code still answers 400', async (t) => {
  class PaymentDeclinedError extends DomainError {
    constructor(message, options = {}) {
      super(message, { ...options, code: 'PAYMENT_DECLINED', status: 402 });
    }
  }
  class ReconciliationError extends DomainError {
    constructor(message, options = {}) {
      super(message, { ...options, code: 'RECONCILIATION_FAILED' });
    }
  }

  const app = await createApp({
    routes: async (instance) => {
      instance.get('/pay', async () => {
        throw new PaymentDeclinedError('card declined', { details: [{ reason: 'insufficient_funds' }] });
      });
      instance.get('/recon', async () => { throw new ReconciliationError('ledger drift'); });
      instance.get('/archived', async () => { throw new NotFoundError('order archived', { status: 410 }); });
      // A code colliding with an Object.prototype key used to resolve to a
      // function and crash the reply with FST_ERR_BAD_STATUS_CODE.
      instance.get('/inherited', async () => {
        throw new DomainError('odd code', { code: 'constructor' });
      });
    },
  });
  t.after(() => app.close());

  const declined = await app.inject('/pay');
  assert.equal(declined.statusCode, 402, 'the error status beats STATUS_BY_CODE');
  assert.equal(declined.json().error.code, 'PAYMENT_DECLINED');
  assert.deepEqual(declined.json().error.details, [{ reason: 'insufficient_funds' }]);

  const recon = await app.inject('/recon');
  assert.equal(recon.statusCode, 400, 'no status and no mapping falls back to 400');
  assert.equal(recon.json().error.code, 'RECONCILIATION_FAILED');

  const archived = await app.inject('/archived');
  assert.equal(archived.statusCode, 410, 'a kit subtype can override its status');
  assert.equal(archived.json().error.code, 'NOT_FOUND');

  const inherited = await app.inject('/inherited');
  assert.equal(inherited.statusCode, 400);
  assert.equal(inherited.json().error.code, 'constructor');
});

test('request ids are UUIDs: valid inbound ids are reused and invalid values are replaced', async (t) => {
  const app = await createApp({ routes: async (instance) => instance.get('/', async () => 'ok') });
  t.after(() => app.close());

  const inbound = randomUUID();
  const reused = await app.inject({ url: '/', headers: { [REQUEST_ID_HEADER]: inbound } });
  assert.equal(reused.headers[REQUEST_ID_HEADER], inbound);

  const replaced = await app.inject({ url: '/', headers: { [REQUEST_ID_HEADER]: 'not-a-uuid' } });
  assert.match(replaced.headers[REQUEST_ID_HEADER], /^[0-9a-f-]{36}$/);
  assert.notEqual(replaced.headers[REQUEST_ID_HEADER], 'not-a-uuid');
});

test('request context is available below the HTTP layer and isolated between requests', async (t) => {
  const context = createContextStore();
  const app = await createApp({
    context,
    routes: async (instance) => {
      instance.get('/', async () => context.get());
    },
  });
  t.after(() => app.close());

  const id = randomUUID();
  const response = await app.inject({ url: '/', headers: { [REQUEST_ID_HEADER]: id } });
  assert.deepEqual(response.json(), { requestId: id, correlationId: id });
  assert.deepEqual(context.get(), {}, 'the request context does not escape its async chain');
});

test('unexpected errors never expose internal messages', async (t) => {
  const app = await createApp({
    routes: async (instance) => instance.get('/', async () => {
      throw new Error('database password was secret');
    }),
  });
  t.after(() => app.close());

  const response = await app.inject('/');
  assert.equal(response.statusCode, 500);
  assert.equal(response.json().error.message, 'Internal server error');
  assert.ok(!response.payload.includes('database password was secret'));
});

test('raw body capture is opt-in and preserves the exact bytes', async (t) => {
  const app = await createApp({
    captureRawBody: true,
    routes: async (instance) => instance.post('/', {
      schema: { body: objectSchema({ value: { type: 'integer' } }, ['value']) },
    }, async (req) => ({ raw: req.rawBody.toString('utf8'), body: req.body })),
  });
  t.after(() => app.close());

  const payload = '{ "value": 1 }';
  const response = await app.inject({
    method: 'POST',
    url: '/',
    headers: { 'content-type': 'application/json' },
    payload,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().raw, payload);
});

test('cors is on by default, reflecting the caller origin, and can be disabled or narrowed', async (t) => {
  const open = await createApp({ routes: async (i) => i.get('/', async () => 'ok') });
  t.after(() => open.close());
  const reflected = await open.inject({ url: '/', headers: { origin: 'https://anything.example' } });
  assert.equal(reflected.headers['access-control-allow-origin'], 'https://anything.example');
  assert.match(reflected.headers.vary ?? '', /Origin/);

  const off = await createApp({ cors: false, routes: async (i) => i.get('/', async () => 'ok') });
  t.after(() => off.close());
  const blocked = await off.inject({ url: '/', headers: { origin: 'https://anything.example' } });
  assert.equal(blocked.headers['access-control-allow-origin'], undefined);

  const scoped = await createApp({
    cors: { origin: ['https://app.example.com'] },
    routes: async (i) => i.get('/', async () => 'ok'),
  });
  t.after(() => scoped.close());
  const allowed = await scoped.inject({ url: '/', headers: { origin: 'https://app.example.com' } });
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://app.example.com');
  const denied = await scoped.inject({ url: '/', headers: { origin: 'https://evil.example' } });
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});

test('helmet is on by default with CSP off, disablable, and CSP re-enablable', async (t) => {
  const def = await createApp({ routes: async (i) => i.get('/', async () => 'ok') });
  t.after(() => def.close());
  const defaults = await def.inject('/');
  assert.equal(defaults.headers['x-content-type-options'], 'nosniff');
  assert.equal(defaults.headers['content-security-policy'], undefined, 'CSP is off by default');

  const off = await createApp({ helmet: false, routes: async (i) => i.get('/', async () => 'ok') });
  t.after(() => off.close());
  assert.equal((await off.inject('/')).headers['x-content-type-options'], undefined);

  const csp = await createApp({
    helmet: { contentSecurityPolicy: { useDefaults: true } },
    routes: async (i) => i.get('/', async () => 'ok'),
  });
  t.after(() => csp.close());
  assert.ok((await csp.inject('/')).headers['content-security-policy'], 'an HTML app can re-enable CSP');
});

test('framework lines are lifecycle, request lines are request', async (t) => {
  const { stream, lines, raw } = sink();
  const app = await createApp({
    logger: createLogger({ destination: stream }),
    routes: async (instance) => instance.get('/', async () => 'ok'),
  });
  t.after(() => app.close());

  app.log.info('framework line'); // stands in for "Server listening at…"
  await app.inject('/');

  assert.equal(lines.find((line) => line.msg === 'framework line').type, LOG_TYPE.LIFECYCLE);

  const requestLines = lines.filter((line) => line.reqId);
  assert.equal(requestLines.length, 2, 'incoming request + request completed');
  for (const line of requestLines) {
    assert.equal(line.type, LOG_TYPE.REQUEST);
  }

  // A second `type` means the request child inherited the instance's, which a
  // reader filtering by substring would resolve to the wrong category.
  for (const line of raw) {
    assert.equal(line.match(/"type":/g).length, 1, `one type per line: ${line}`);
  }

  // A raw IncomingMessage here would mean the child was built off the wrong
  // parent and lost Fastify's serializers.
  const { req } = lines.find((line) => line.req);
  assert.deepEqual(Object.keys(req).sort(), ['host', 'method', 'remoteAddress', 'url']);
});
