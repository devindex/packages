import { createHash } from 'node:crypto';

export async function loadBullmq() {
  try {
    return await import('bullmq');
  } catch (error) {
    if (['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(error?.code)) {
      throw new Error(
        'BullMQ support requires `bullmq` and `ioredis`: install both packages',
        { cause: error },
      );
    }
    throw error;
  }
}

function safeSegment(value) {
  const source = String(value);
  // Slugifying is lossy; the hash suffix keeps the queue name unique.
  const readable = source.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'work';
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 10);
  return `${readable.slice(0, 40)}-${hash}`;
}

export function queueName(prefix, kind, name) {
  return `${safeSegment(prefix)}-${kind}-${safeSegment(name)}`;
}
