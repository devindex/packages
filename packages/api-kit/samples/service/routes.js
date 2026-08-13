import { ConflictError, NotFoundError } from '@devindex/api-kit/errors';
import { serializableContext } from '@devindex/api-kit/context';
import { orderStore } from './domain.js';

/**
 * Builds the app's route plugin, closing over the bus and context it needs.
 * Domain errors thrown here leave through the kit's single error envelope — no
 * HTTP try/catch, no status codes in the route.
 */
export function makeRoutes({ bus, context }) {
  return async (app) => {
    app.post('/orders', {
      schema: {
        body: {
          type: 'object',
          required: ['orderId'],
          properties: { orderId: { type: 'string' } },
        },
      },
    }, async (req, reply) => {
      const { orderId } = req.body;

      if (await orderStore.exists(orderId)) {
        // → 409 { error: { code: 'CONFLICT', message, details, requestId } }
        throw new ConflictError('order already placed', { details: [{ field: 'orderId' }] });
      }
      await orderStore.create(orderId);

      // publish only carries key/delay, so the correlation id rides in the
      // payload — that is what should cross a queue boundary.
      await bus.publish('order.placed', {
        orderId,
        _ctx: serializableContext(context.get()),
      }, { key: `order:${orderId}` });

      reply.code(201);
      return { orderId };
    });

    app.get('/orders/:id', async (req) => {
      const order = await orderStore.find(req.params.id);
      if (!order) throw new NotFoundError('order not found'); // → 404, message preserved
      return order;
    });
  };
}
