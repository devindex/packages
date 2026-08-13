import pino from 'pino';
import { cleanStack } from '../errors/stack.js';

// Wraps pino's std err serializer so every `{ err }` log line carries
// repo-relative frames instead of absolute, machine-specific paths. The cause
// chain the std serializer attaches is cleaned too.
function errSerializer(error) {
  const serialized = pino.stdSerializers.err(error);
  if (serialized?.stack) serialized.stack = cleanStack(serialized.stack);
  if (serialized?.cause?.stack) serialized.cause.stack = cleanStack(serialized.cause.stack);
  return serialized;
}

// Redaction is configured once, at logger creation — never at the call site.
//
// pino's `*` matches exactly one level, so a key has to be listed per depth.
// Three tiers cover `{ password }`, `{ body: { password } }` and
// `{ req: { body: { password } } }` — the shapes a handler actually logs.
const SECRET_KEYS = [
  'password',
  'passwordHash',
  'token',
  'tokenHash',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
];

export const DEFAULT_REDACT_PATHS = Object.freeze(
  SECRET_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
);

/**
 * Closed vocabulary for the `type` field, the discriminator that lets a log
 * store split request, event, job and integration lines apart after the fact.
 */
export const LOG_TYPE = Object.freeze({
  REQUEST: 'request',
  EVENT: 'event',
  JOB: 'job',
  SCHEDULE: 'schedule',
  INTEGRATION: 'integration',
  LIFECYCLE: 'lifecycle',
});

/**
 * Whether `pino-pretty` can be loaded, so a `pretty` request degrades to JSON
 * instead of throwing when the optional peer is absent.
 *
 * @return {boolean}
 */
export function prettyAvailable() {
  try {
    import.meta.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the pino transport for human-readable output, or `undefined` for the
 * JSON default. Exported so it can be asserted without spawning a worker thread.
 *
 * @param {boolean|object} [pretty=false] - `true` for the defaults, or pino-pretty options to merge.
 * @return {object|undefined} A pino `transport` option, or undefined.
 */
export function prettyTransport(pretty = false) {
  if (!pretty) return undefined;
  return {
    target: 'pino-pretty',
    options: {
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
      ...(pretty === true ? {} : pretty),
    },
  };
}

/**
 * Creates the process logger. Everything that shapes it arrives as data — the
 * level, where it writes and which transport carries the lines are the app's
 * decisions, not the environment's.
 *
 * @param {object} [options]
 * @param {string} [options.level='info'] - pino level.
 * @param {readonly string[]} [options.redact] - Paths to censor. Defaults to `DEFAULT_REDACT_PATHS`.
 * @param {string} [options.censor='[redacted]'] - Replacement for redacted values.
 * @param {object} [options.transport] - A pino `transport` (single `{target}` or `{targets:[…]}`). Wins over `pretty`.
 * @param {boolean|object} [options.pretty=false] - Convenience `pino-pretty` transport; needs the optional peer. Ignored when `transport` is set.
 * @param {object} [options.base] - Bindings on every line. Omitted leaves pino's default.
 * @param {import('node:stream').Writable} [options.destination] - Where to write. Cannot combine with a transport.
 * @param {{get: Function}} [options.context] - A context store; its fields ride on every line as a mixin.
 * @param {object} [options.serializers] - Merged over the default `err` serializer.
 * @param {object} [options.pinoOptions] - Escape hatch, merged last.
 * @return {import('pino').Logger} The logger.
 */
export function createLogger({
  level = 'info',
  redact = DEFAULT_REDACT_PATHS,
  censor = '[redacted]',
  transport,
  pretty = false,
  base,
  destination,
  context,
  serializers,
  pinoOptions = {},
} = {}) {
  // An explicit transport is the caller's to get right; the `pretty` convenience
  // degrades to JSON when its optional peer is missing instead of crashing.
  const activeTransport = transport ?? (pretty && prettyAvailable() ? prettyTransport(pretty) : undefined);

  // pino writes a transport from a worker thread and a `destination` from the
  // main one; wiring both leaves two sinks fighting over the same logger.
  if (activeTransport && destination) {
    throw new Error('createLogger: a transport (including `pretty`) cannot combine with `destination`');
  }

  const paths = [...redact];
  const { mixin: applicationMixin, ...remainingPinoOptions } = pinoOptions;

  // The context store's fields (requestId, correlationId) ride on every line so
  // a correlation id survives into the log without the call site repeating it.
  const mixin = context || applicationMixin
    ? (...args) => ({
        ...(context?.get() ?? {}),
        ...(applicationMixin?.(...args) ?? {}),
      })
    : undefined;

  const options = {
    level,
    ...(paths.length > 0 ? { redact: { paths, censor } } : {}),
    ...(base === undefined ? {} : { base }),
    // `{ err }` is the shape the kit's error handler logs; the serializer turns
    // it into type/message/stack, with paths relativized to the cwd.
    serializers: { err: errSerializer, ...serializers },
    ...(activeTransport ? { transport: activeTransport } : {}),
    ...(mixin ? { mixin } : {}),
    ...remainingPinoOptions,
  };

  return destination ? pino(options, destination) : pino(options);
}

/**
 * Stamps a category (and optional bindings) onto a child logger, so every line
 * from that scope carries the same `type` for later filtering.
 *
 * @param {import('pino').Logger} logger
 * @param {string} type - One of `LOG_TYPE`.
 * @param {object} [bindings] - Extra fields fixed on the child, e.g. `{ jobName }`.
 * @return {import('pino').Logger} The child logger.
 */
export function withType(logger, type, bindings = {}) {
  return logger.child({ type, ...bindings });
}
