import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const queuePrefix = process.env.QUEUE_PREFIX ?? 'arkive';
const systemQueueName = 'system';
const m365QueueName = 'm365';

const systemQueue = new Queue(systemQueueName, { connection: redis, prefix: queuePrefix });

const systemWorker = new Worker(
  systemQueueName,
  async (job) => {
    if (job.name === 'health.ping') {
      return { ok: true, at: new Date().toISOString() };
    }
    return { ignored: true };
  },
  { connection: redis, prefix: queuePrefix },
);

const m365Worker = new Worker(
  m365QueueName,
  async (job) => {
    if (job.name !== 'm365.lifecycle') {
      return { ignored: true };
    }

    return {
      handled: true,
      mode: (process.env.M365_DRY_RUN ?? 'true') === 'true' ? 'dry-run' : 'live',
      at: new Date().toISOString(),
      payload: job.data,
    };
  },
  { connection: redis, prefix: queuePrefix },
);

systemWorker.on('ready', async () => {
  await systemQueue.add('health.ping', { source: 'worker-startup' });
  // eslint-disable-next-line no-console
  console.log('worker ready');
});

systemWorker.on('failed', (job, err) => {
  // eslint-disable-next-line no-console
  console.error('system worker job failed', { id: job?.id, err: err.message });
});

m365Worker.on('failed', (job, err) => {
  // eslint-disable-next-line no-console
  console.error('m365 worker job failed', { id: job?.id, err: err.message });
});
