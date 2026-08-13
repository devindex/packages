import fp from 'fastify-plugin';

/** Optional exact-body capture for webhook signature verification. */
export default fp(async function rawBody(app) {
  if (!app.hasRequestDecorator('rawBody')) app.decorateRequest('rawBody', null);
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      req.rawBody = body;
      if (body.length === 0) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch (error) {
        error.statusCode = 400;
        done(error);
      }
    },
  );
});
