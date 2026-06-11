const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

redis.on('connect',  () => console.log('[redis] connected'));
redis.on('error',    (err) => console.error('[redis] error:', err.message));

// Push a job ID onto the correct queue list
async function enqueue(queue, jobId) {
  const key = `queue:${queue}`;
  await redis.lpush(key, jobId);
  console.log(`[redis] enqueued job ${jobId} → ${key}`);
}

module.exports = { redis, enqueue };
