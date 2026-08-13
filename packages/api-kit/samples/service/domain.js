import { logger } from './logger.js';

// Stand-in domain: an in-memory order store and the side effects a real service
// would perform against a database and external providers. Swap these out; the
// rest of the sample does not change.
const orders = new Map();

export const orderStore = {
  async exists(id) {
    return orders.has(id);
  },
  async create(id) {
    orders.set(id, { id, createdAt: new Date().toISOString() });
  },
  async find(id) {
    return orders.get(id) ?? null;
  },
};

export const mailer = {
  async sendReceipt(orderId, { idempotencyKey }) {
    // A real mailer keys the send on idempotencyKey so a job retry never
    // sends the receipt twice.
    logger.info({ effect: 'mailer.sendReceipt', orderId, idempotencyKey }, 'receipt effect');
  },
};

export const analytics = {
  async record(orderId) {
    logger.info({ effect: 'analytics.record', orderId }, 'analytics effect');
  },
};

export async function settle() {
  logger.info({ effect: 'settle.run' }, 'settlement effect');
}
