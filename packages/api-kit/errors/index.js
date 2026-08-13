import { ERROR_CODE } from './codes.js';

export { ERROR_CODE, ERROR_CODES } from './codes.js';
export { cleanStack } from './stack.js';

// Two copies of the package give the app two DomainError classes, and
// `instanceof` rejects the one it did not import. A registry symbol is shared.
const DOMAIN_ERROR_BRAND = Symbol.for('@devindex/api-kit/DomainError');

/**
 * @typedef {object} DomainErrorOptions
 * @property {string} [code=ERROR_CODE.DOMAIN_ERROR] - Ignored by the subtypes, which pin their own.
 * @property {number} [status] - HTTP status. Omitted, the HTTP layer derives one from `code`.
 * @property {Array<object>} [details=[]] - Machine-readable specifics, e.g. `[{ field: 'email' }]`.
 * @property {unknown} [cause] - The underlying failure, kept for the logs.
 */

/**
 * Base of every error the domain throws on purpose. Carries a code, details and
 * an optional HTTP status.
 *
 * @param {string} message - Sent in the envelope, so safe to show a client.
 * @param {DomainErrorOptions} [options]
 */
export class DomainError extends Error {
  constructor(message, { code = ERROR_CODE.DOMAIN_ERROR, status, details = [], cause } = {}) {
    super(message, { cause });
    // new.target so each subclass reports its own name, not "DomainError".
    this.name = new.target.name;
    this.code = code;
    // Absent rather than undefined: `status` reaches log lines and any spread of
    // the error, so an error that never meets HTTP carries no trace of it.
    if (status !== undefined) this.status = status;
    this.details = details;
    // Non-enumerable: the brand must not reach a log line or a response body.
    Object.defineProperty(this, DOMAIN_ERROR_BRAND, { value: true });
    Error.captureStackTrace?.(this, new.target);
  }
}

/** Input the schema accepted but the domain rejects — a range ending before it starts. */
export class ValidationError extends DomainError {
  constructor(message = 'Validation failed', options = {}) {
    super(message, { ...options, code: ERROR_CODE.VALIDATION_ERROR });
  }
}

/** Missing, malformed or expired credentials — the caller is unknown. */
export class AuthError extends DomainError {
  constructor(message = 'Unauthorized', options = {}) {
    super(message, { ...options, code: ERROR_CODE.UNAUTHORIZED });
  }
}

/** Authenticated, but not allowed to do this. Re-authenticating will not help. */
export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden', options = {}) {
    super(message, { ...options, code: ERROR_CODE.FORBIDDEN });
  }
}

/** The addressed resource does not exist, or is not visible to this caller. */
export class NotFoundError extends DomainError {
  constructor(message = 'Not found', options = {}) {
    super(message, { ...options, code: ERROR_CODE.NOT_FOUND });
  }
}

/** The resource exists, but does not support the requested HTTP method. */
export class MethodNotAllowedError extends DomainError {
  constructor(message = 'Method not allowed', options = {}) {
    super(message, { ...options, code: ERROR_CODE.METHOD_NOT_ALLOWED });
  }
}

/** The write would break a uniqueness or state invariant. */
export class ConflictError extends DomainError {
  constructor(message = 'Conflict', options = {}) {
    super(message, { ...options, code: ERROR_CODE.CONFLICT });
  }
}

/** A quota or plan allowance is used up. A bigger plan unblocks it, waiting does not. */
export class LimitError extends DomainError {
  constructor(message = 'Limit reached', options = {}) {
    super(message, { ...options, code: ERROR_CODE.LIMIT_REACHED });
  }
}

/** The request payload exceeds the size the server accepts. */
export class PayloadError extends DomainError {
  constructor(message = 'Payload too large', options = {}) {
    super(message, { ...options, code: ERROR_CODE.PAYLOAD_TOO_LARGE });
  }
}

/** Rate limited. The same call is expected to succeed later, unchanged. */
export class TooManyRequestsError extends DomainError {
  constructor(message = 'Too many requests', options = {}) {
    super(message, { ...options, code: ERROR_CODE.TOO_MANY_REQUESTS });
  }
}

/** A dependency is down or shedding load — an open breaker, a provider timing out. */
export class UnavailableError extends DomainError {
  constructor(message = 'Service unavailable', options = {}) {
    super(message, { ...options, code: ERROR_CODE.UNAVAILABLE });
  }
}

/**
 * Whether the domain threw this on purpose. Use it over `instanceof`.
 *
 * @param {unknown} error - Anything, including `null` and non-objects.
 * @return {boolean} True for a DomainError from any copy of this package.
 */
export function isDomainError(error) {
  return Boolean(error?.[DOMAIN_ERROR_BRAND]);
}
