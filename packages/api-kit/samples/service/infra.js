import { createContextStore } from '@devindex/api-kit/context';
import { createJobQueue } from '@devindex/api-kit/jobs';
import { createEventBus } from '@devindex/api-kit/events';
import { createSchedule } from '@devindex/api-kit/schedule';
import { logger } from './logger.js';

// The kit never selects a driver from the environment; the sample decides here.
// With no REDIS_URL everything runs in memory and needs no external service.
const redisUrl = process.env.REDIS_URL;
// Every distributed driver names what runs the work — BullMQ — not its store.
const driver = redisUrl ? 'bullmq' : 'memory';
const prefix = 'sample-service';
const defaults = { attempts: 3, backoff: { type: 'exponential', delay: 1_000 } };

export { logger };
export const context = createContextStore();
export const jobs = createJobQueue({ driver, redisUrl, prefix, logger, defaults });
export const bus = createEventBus({ driver, redisUrl, prefix, logger, defaults });
export const schedule = createSchedule({ driver, redisUrl, prefix, logger });
