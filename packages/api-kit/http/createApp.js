import Fastify from 'fastify';
import decorators from './plugins/decorators.js';
import errorHandler from './plugins/errorHandler.js';
import rawBody from './plugins/rawBody.js';
import requestContext from './plugins/requestContext.js';
import requestId, { genReqId } from './plugins/requestId.js';
import { LOG_TYPE, withType } from '../log/index.js';
import corsPlugin from '@fastify/cors';
import helmetPlugin from '@fastify/helmet';

// CSP is a browser directive for rendered documents, inert on JSON responses,
// and its default breaks any HTML tooling bolted onto the API (Swagger, error
// pages). An app serving HTML re-enables it with its own directives.
const HELMET_DEFAULTS = Object.freeze({ global: true, contentSecurityPolicy: false });

/**
 * Builds the complete Fastify stack without binding a port, so tests can drive
 * it with `app.inject()`. Async context is opt-in: pass a `context` store to
 * propagate the correlation id below the HTTP layer; omitted, no ALS runs.
 *
 * @param {object} [options]
 * @param {object} [options.logger] - A pino instance, base and untyped — the kit stamps `type:lifecycle` on the instance and `type:request` per request. Omitted disables Fastify's logging.
 * @param {object} [options.context] - A context store from `./context`. Omitted disables ALS.
 * @param {object|false} [options.helmet] - `@fastify/helmet` options. On by default with CSP off; pass `false` to disable. Re-enable CSP for HTML endpoints.
 * @param {object|false} [options.cors] - `@fastify/cors` options. On by default reflecting the caller's origin; pass `false` to disable. Override `origin` for a credentialed API.
 * @param {Function} [options.routes] - The app's route plugin, registered last.
 * @param {Array<Function|[Function, object]>} [options.plugins] - Extra plugins, in order.
 * @param {string[]} [options.requestProperties] - Names decorated as null request slots, filled per request.
 * @param {boolean} [options.captureRawBody=false] - Keep the exact bytes on `req.rawBody`.
 * @param {Array} [options.ajvPlugins] - ajv plugins, e.g. `[ajvFormats]` for `format` support.
 * @param {object} [options.ajvOptions] - Merged over ajv's `customOptions`.
 * @param {Function} [options.genReqId] - Correlation id strategy. Defaults to the kit's.
 * @param {object} [options.fastify] - Merged last into the Fastify constructor options.
 * @return {Promise<import('fastify').FastifyInstance>} The built instance, not listening.
 */
export async function createApp({
  logger,
  context,
  helmet,
  cors,
  routes,
  plugins = [],
  requestProperties = [],
  captureRawBody = false,
  ajvPlugins = [],
  ajvOptions = {},
  genReqId: genReqIdOption = genReqId,
  fastify: fastifyOptions = {},
} = {}) {
  const app = Fastify({
    ...(logger
      ? {
          loggerInstance: logger,
          // Deriving from `parent` is what keeps Fastify's req/res serializers on
          // the line; a child built off any other logger dumps the raw socket.
          childLoggerFactory(parent, bindings, opts) {
            return parent.child({ ...bindings, type: LOG_TYPE.REQUEST }, opts);
          },
        }
      : { logger: false }),
    genReqId: genReqIdOption,
    ajv: {
      customOptions: ajvOptions,
      plugins: ajvPlugins,
    },
    ...fastifyOptions,
  });

  // `app.log` is Fastify's wrapper around `logger`, the layer holding the req/res
  // serializers. Re-binding it here, after the routes took their own logger from
  // the options above, reaches only the instance's lines — server listening, plugin
  // warnings; at construction it would leave `type` twice on every request line.
  if (logger) app.log = withType(app.log, LOG_TYPE.LIFECYCLE);

  await app.register(decorators, { properties: requestProperties });
  await app.register(requestContext, { context });
  await app.register(requestId);
  if (captureRawBody) await app.register(rawBody);
  await app.register(errorHandler);

  if (helmet !== false) {
    await app.register(helmetPlugin, helmet && helmet !== true ? { ...HELMET_DEFAULTS, ...helmet } : HELMET_DEFAULTS);
  }
  if (cors !== false) {
    await app.register(corsPlugin, cors && cors !== true ? { origin: true, ...cors } : { origin: true });
  }

  for (const entry of plugins) {
    const [plugin, options] = Array.isArray(entry) ? entry : [entry];
    await app.register(plugin, options);
  }
  if (routes) await app.register(routes);

  return app;
}
