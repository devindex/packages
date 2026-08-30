export function objectSchema(properties, required = []) {
  return { type: 'object', properties, required };
}

export function pageQuery({ maxLimit = 100, defaultLimit = 20 } = {}) {
  return objectSchema({
    limit: { type: 'integer', minimum: 1, maximum: maxLimit, default: defaultLimit },
    offset: { type: 'integer', minimum: 0, default: 0 },
  });
}

export function pageResponse(items, { total = false } = {}) {
  return objectSchema({
    items: { type: 'array', items },
    hasMore: { type: 'boolean' },
    ...(total && { total: { type: 'integer', minimum: 0 } }),
  }, total ? ['items', 'hasMore', 'total'] : ['items', 'hasMore']);
}

export const stringSchema = (options = {}) => ({ type: 'string', minLength: 1, ...options });
export const email = Object.freeze({ type: 'string', format: 'email' });
export const dateTime = Object.freeze({ type: 'string', format: 'date-time' });
export const dateKey = Object.freeze({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
export const clock = Object.freeze({ type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' });
