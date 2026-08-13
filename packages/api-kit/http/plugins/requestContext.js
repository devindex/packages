import fp from 'fastify-plugin';

/** Makes request/correlation ids available below the HTTP layer via ALS. */
export default fp(async function requestContext(app, { context } = {}) {
  if (!context) return;
  app.addHook('onRequest', (req, _reply, done) => {
    context.run({ requestId: req.id, correlationId: req.id }, done);
  });
});
