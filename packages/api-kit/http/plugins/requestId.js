import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';

export const REQUEST_ID_HEADER = 'x-request-id';
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Only a valid UUID is trusted as an inbound correlation id. */
export function genReqId(req) {
  const inbound = req.headers[REQUEST_ID_HEADER];
  return isUuid(inbound) ? inbound : randomUUID();
}

export default fp(async function requestId(app) {
  app.addHook('onSend', async (req, reply) => {
    reply.header(REQUEST_ID_HEADER, req.id);
  });
});
