import { createEventBus } from '@devindex/api-kit/events';

const bus = createEventBus();

bus.subscribe('number-created', 'subscriber-1', async ({ number }) => {
  console.log(`[event:s1] received ${number}`)
});

bus.subscribe('number-created', 'subscriber-2', async ({ number }) => {
  console.log(`[event:s2] received ${number}`)
});

async function main() {
  await bus.start();

  setInterval(() => {
    const number = Math.round(Math.random() * 100);
    bus.publish('number-created', { number }, { key: `n:${number}` });
  }, 1000);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
