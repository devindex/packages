import fp from 'fastify-plugin';

/**
 * Declares request-scoped properties as empty (null) slots, filled per request.
 */
export default fp(async function decorators(app, { properties = [] } = {}) {
  // A shared non-null default would bleed state across requests.
  for (const name of properties) app.decorateRequest(name, null);
});
