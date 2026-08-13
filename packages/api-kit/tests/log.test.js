import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { createContextStore } from '../context/index.js';
import {
  createLogger,
  withType,
  prettyTransport,
  prettyAvailable,
  DEFAULT_REDACT_PATHS,
  LOG_TYPE,
} from '../log/index.js';

// Collects each JSON line pino writes so a test can assert on the record.
function sink() {
  const lines = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(JSON.parse(chunk.toString()));
      done();
    },
  });
  return { stream, lines };
}

test('exposes the pino shape (level methods + child)', () => {
  const { stream } = sink();
  const log = createLogger({ destination: stream });
  for (const level of ['fatal', 'error', 'warn', 'info', 'debug', 'trace']) {
    assert.equal(typeof log[level], 'function');
  }
  assert.equal(typeof log.child, 'function');
});

test('redacts secret keys at every configured depth', () => {
  const { stream, lines } = sink();
  const log = createLogger({ destination: stream });
  log.info({ password: 'a', body: { token: 'b' }, req: { body: { apiKey: 'c' } } }, 'msg');
  const [record] = lines;
  assert.equal(record.password, '[redacted]');
  assert.equal(record.body.token, '[redacted]');
  assert.equal(record.req.body.apiKey, '[redacted]');
});

test('honours a custom censor', () => {
  const { stream, lines } = sink();
  const log = createLogger({ destination: stream, censor: '***' });
  log.info({ password: 'a' }, 'msg');
  assert.equal(lines[0].password, '***');
});

test('keeps user fields when redaction is disabled', () => {
  const { stream, lines } = sink();
  const log = createLogger({ destination: stream, redact: [] });
  log.info({ password: 'plain' }, 'msg');
  assert.equal(lines[0].password, 'plain');
});

test('base bindings appear on every line', () => {
  const { stream, lines } = sink();
  const log = createLogger({ destination: stream, base: { service: 'demo' } });
  log.info('one');
  log.info('two');
  assert.deepEqual(lines.map((l) => l.service), ['demo', 'demo']);
});

test('context store fields ride on every line via the mixin', () => {
  const { stream, lines } = sink();
  const context = createContextStore();
  const log = createLogger({ destination: stream, context });
  context.run({ requestId: 'req-1', correlationId: 'corr-1' }, () => {
    log.info('inside');
  });
  log.info('outside');
  assert.equal(lines[0].requestId, 'req-1');
  assert.equal(lines[0].correlationId, 'corr-1');
  assert.equal(lines[1].requestId, undefined);
});

test('default err serializer expands an Error into type/message/stack', () => {
  const { stream, lines } = sink();
  const log = createLogger({ destination: stream });
  log.error({ err: new TypeError('boom') }, 'failed');
  const { err } = lines[0];
  assert.equal(err.type, 'TypeError');
  assert.equal(err.message, 'boom');
  assert.equal(typeof err.stack, 'string');
});

test('the err serializer relativizes stack paths to the cwd', () => {
  const { stream, lines } = sink();
  const log = createLogger({ destination: stream });
  log.error({ err: new Error('boom') }, 'failed');
  const { err } = lines[0];
  assert.doesNotMatch(err.stack, new RegExp(process.cwd()));
  assert.match(err.stack, /tests\/log\.test\.js/);
});

test('withType stamps the category and extra bindings on a child', () => {
  const { stream, lines } = sink();
  const log = createLogger({ destination: stream });
  withType(log, LOG_TYPE.JOB, { jobName: 'sync' }).info('running');
  assert.equal(lines[0].type, 'job');
  assert.equal(lines[0].jobName, 'sync');
});

test('LOG_TYPE and DEFAULT_REDACT_PATHS are frozen', () => {
  assert.ok(Object.isFrozen(LOG_TYPE));
  assert.ok(Object.isFrozen(DEFAULT_REDACT_PATHS));
});

test('prettyTransport builds a pino-pretty target only when asked', () => {
  assert.equal(prettyTransport(false), undefined);
  assert.equal(prettyTransport(true).target, 'pino-pretty');
  assert.equal(prettyTransport({ colorize: false }).options.colorize, false);
});

test('prettyAvailable returns a boolean', () => {
  assert.equal(typeof prettyAvailable(), 'boolean');
});

test('a transport cannot combine with a destination', () => {
  const { stream } = sink();
  assert.throws(
    () => createLogger({ destination: stream, transport: { target: 'pino/file' } }),
    /mutually|combine/i,
  );
  assert.throws(
    () => createLogger({ destination: stream, pretty: true }),
    /combine/i,
  );
});
