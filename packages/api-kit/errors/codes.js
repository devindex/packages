// Codes reach clients and log queries, so they outlive messages and statuses.
// No subtype throws INTERNAL_ERROR: the HTTP handler produces it for whatever
// it could not classify.

export const ERROR_CODE = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  LIMIT_REACHED: 'LIMIT_REACHED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  UNAVAILABLE: 'UNAVAILABLE',
  DOMAIN_ERROR: 'DOMAIN_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

/** Every code, for a JSON Schema `enum` on the error envelope. */
export const ERROR_CODES = Object.freeze(Object.values(ERROR_CODE));
