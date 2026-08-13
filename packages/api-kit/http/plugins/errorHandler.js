import fp from 'fastify-plugin';
import { ERROR_CODE, isDomainError } from '../../errors/index.js';

export const STATUS_BY_CODE = Object.freeze({
  [ERROR_CODE.VALIDATION_ERROR]: 422,
  [ERROR_CODE.UNAUTHORIZED]: 401,
  [ERROR_CODE.FORBIDDEN]: 403,
  [ERROR_CODE.NOT_FOUND]: 404,
  [ERROR_CODE.METHOD_NOT_ALLOWED]: 405,
  [ERROR_CODE.CONFLICT]: 409,
  [ERROR_CODE.LIMIT_REACHED]: 402,
  [ERROR_CODE.PAYLOAD_TOO_LARGE]: 413,
  [ERROR_CODE.TOO_MANY_REQUESTS]: 429,
  [ERROR_CODE.UNAVAILABLE]: 503,
  [ERROR_CODE.DOMAIN_ERROR]: 400,
  [ERROR_CODE.INTERNAL_ERROR]: 500,
});

// A Fastify/plugin error carrying only an HTTP status must not be labelled a
// validation failure: the envelope's `code` follows the status, so a 429 reads
// TOO_MANY_REQUESTS and a 403 reads FORBIDDEN instead of all collapsing to one.
const CODE_BY_STATUS = Object.freeze({
  400: ERROR_CODE.VALIDATION_ERROR,
  401: ERROR_CODE.UNAUTHORIZED,
  402: ERROR_CODE.LIMIT_REACHED,
  403: ERROR_CODE.FORBIDDEN,
  404: ERROR_CODE.NOT_FOUND,
  405: ERROR_CODE.METHOD_NOT_ALLOWED,
  409: ERROR_CODE.CONFLICT,
  413: ERROR_CODE.PAYLOAD_TOO_LARGE,
  422: ERROR_CODE.VALIDATION_ERROR,
  429: ERROR_CODE.TOO_MANY_REQUESTS,
});

// Own-property only: an app code spelled `constructor` or `toString` would
// otherwise resolve up the prototype chain and hand Fastify a function as status.
function statusForCode(code) {
  return Object.hasOwn(STATUS_BY_CODE, code) ? STATUS_BY_CODE[code] : 400;
}

function schemaDetails(validation = []) {
  return validation.map((issue) => ({
    path: issue.instancePath || issue.params?.missingProperty || '',
    message: issue.message,
  }));
}

/**
 * Maps an error to its response shape. A domain error's own `status` wins over
 * `STATUS_BY_CODE`, which is what lets an app code carry a status the kit's
 * table has never heard of.
 *
 * @return {{status: number, code: string, message: string, details: Array<object>}|null}
 *   Null when the error is unrecognized; treat it as a 500.
 */
export function classifyError(error) {
  if (isDomainError(error)) {
    return {
      status: error.status ?? statusForCode(error.code),
      code: error.code,
      message: error.message,
      details: error.details ?? [],
    };
  }

  if (error?.validation) {
    return {
      // Same code as a domain ValidationError, so the same status (STATUS_BY_CODE).
      status: STATUS_BY_CODE[ERROR_CODE.VALIDATION_ERROR],
      code: ERROR_CODE.VALIDATION_ERROR,
      message: 'Request validation failed',
      details: schemaDetails(error.validation),
    };
  }

  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    return {
      status: error.statusCode,
      code: CODE_BY_STATUS[error.statusCode] ?? ERROR_CODE.DOMAIN_ERROR,
      message: error.message,
      details: [],
    };
  }

  return null;
}

function envelope(known, requestId) {
  return {
    error: {
      code: known.code,
      message: known.message,
      details: known.details ?? [],
      requestId,
    },
  };
}

export default fp(async function errorHandler(app) {
  app.setErrorHandler((error, req, reply) => {
    const known = classifyError(error);
    if (!known) {
      req.log.error({ err: error }, 'unhandled request error');
      reply.status(500).send(envelope({
        code: ERROR_CODE.INTERNAL_ERROR,
        message: 'Internal server error',
        details: [],
      }, req.id));
      return;
    }

    const level = known.status >= 500 ? 'error' : 'info';
    req.log[level]({ err: error, code: known.code }, 'request failed');
    reply.status(known.status).send(envelope(known, req.id));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(envelope({
      code: ERROR_CODE.NOT_FOUND,
      message: `Route ${req.method} ${req.url} not found`,
      details: [],
    }, req.id));
  });
});
