const Redis = require('ioredis');
const http = require('http');
const { Pool } = require('pg');
const os = require('os');

// ── Connections ────────────────────────────────────────────
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

const db = new Pool({
  host:     process.env.POSTGRES_HOST || 'localhost',
  port:     process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB   || 'taskqueue',
  user:     process.env.POSTGRES_USER || 'admin',
  password: process.env.POSTGRES_PASS || 'secret',
});

const redisScheduler = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

const WORKER_ID = `${os.hostname()}-${process.pid}`;
const QUEUES    = ['queue:high', 'queue:default', 'queue:low'];
const HEARTBEAT_INTERVAL = 10_000; // ping every 10s
const HEARTBEAT_TTL      = 35;     // Redis key expires after 35s
const STALE_THRESHOLD    = 30;     // jobs with no heartbeat for 30s get requeued
const SCHEDULER_INTERVAL = 30_000; // check for stale jobs every 30s

console.log(`[worker] starting — id: ${WORKER_ID}`);
console.log(`[worker] listening on queues: ${QUEUES.join(', ')}`);

// ── Task Handlers ──────────────────────────────────────────
const handlers = {
  send_welcome_email: async (payload) => {
    console.log(`  → sending welcome email to ${payload.to || 'user'}`);
    await sleep(300);
  },

  resize_image: async (payload) => {
    console.log(`  → resizing image ${payload.image_id}`);
    await sleep(500);
  },

  generate_invoice: async (payload) => {
    console.log(`  → generating invoice for order ${payload.order_id}`);
    await sleep(800);
  },

  // Slow job — useful for testing heartbeat (takes 25s)
  slow_job: async (payload) => {
    console.log(`  → running slow job for 25s...`);
    await sleep(25_000);
    console.log(`  → slow job complete`);
  },

  fail_always: async (payload) => {
    throw new Error('intentional failure for retry demo');
  },

  default: async (payload) => {
    console.log(`  → executing with payload:`, JSON.stringify(payload));
    await sleep(200);
  },
};

// ── Heartbeat ──────────────────────────────────────────────
// While a job is running, ping Redis every 10s so the scheduler
// knows this worker is alive. Key auto-expires after 35s.
function startHeartbeat(jobId) {
  const key = `heartbeat:${WORKER_ID}:${jobId}`;
  const interval = setInterval(async () => {
    try {
      await redis.setex(key, HEARTBEAT_TTL, Date.now());
      await db.query(`UPDATE jobs SET last_heartbeat = now() WHERE id = $1`, [jobId]);
      console.log(`[heartbeat] ♥ ${jobId.slice(0, 8)}…`);
    } catch (err) {
      console.error('[heartbeat] error:', err.message);
    }
  }, HEARTBEAT_INTERVAL);
  return { key, interval };
}

function stopHeartbeat({ key, interval }) {
  clearInterval(interval);
  redis.del(key).catch(() => {});
}

// ── Crash Recovery Scheduler ───────────────────────────────
// Runs every 30s. Finds jobs stuck in 'running' with no heartbeat
// for over 30s and requeues them automatically.
async function runScheduler() {
  try {
    const { rows } = await db.query(`
      SELECT id, queue, attempts, max_attempts
      FROM jobs
      WHERE status = 'running'
        AND last_heartbeat < now() - interval '${STALE_THRESHOLD} seconds'
    `);

    if (rows.length > 0) {
      console.log(`[scheduler] found ${rows.length} stale job(s) — requeuing`);
    }

    for (const job of rows) {
      if (job.attempts >= job.max_attempts) {
        await db.query(
          `UPDATE jobs SET status = 'failed', error = 'worker crashed — max attempts reached' WHERE id = $1`,
          [job.id]
        );
        console.log(`[scheduler] job ${job.id.slice(0,8)}… permanently failed`);
      } else {
        await db.query(
          `UPDATE jobs SET status = 'pending', worker_id = NULL WHERE id = $1`,
          [job.id]
        );
        await redisScheduler.lpush(`queue:${job.queue}`, job.id);
        console.log(`[scheduler] ↩ requeued stale job ${job.id.slice(0,8)}…`);
      }
    }
  } catch (err) {
    console.error('[scheduler] error:', err.message);
  }
}

// ── Main Loop ──────────────────────────────────────────────
async function run() {
  // Start the crash recovery scheduler
  setTimeout(() => { runScheduler(); setInterval(runScheduler, SCHEDULER_INTERVAL); }, 2000);
  console.log(`[scheduler] running every ${SCHEDULER_INTERVAL / 1000}s`);

  while (true) {
    try {
      const result = await redis.brpop(...QUEUES, 0);
      if (!result) continue;
      const [_queueKey, jobId] = result;
      await processJob(jobId);
    } catch (err) {
      console.error('[worker] loop error:', err.message);
      await sleep(1000);
    }
  }
}

// ── Process a Single Job ───────────────────────────────────
async function processJob(jobId) {
  const { rows } = await db.query(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
  const job = rows[0];

  if (!job) {
    console.warn(`[worker] job ${jobId} not found in DB — skipping`);
    return;
  }

  if (job.status === 'done') {
    console.log(`[worker] job ${jobId} already done — skipping`);
    return;
  }

  console.log(`[worker] picked up job ${jobId.slice(0,8)}… (${job.name}) from ${job.queue}`);

  // Mark running + start heartbeat
  await db.query(
    `UPDATE jobs SET status = 'running', worker_id = $1,
     attempts = attempts + 1, last_heartbeat = now() WHERE id = $2`,
    [WORKER_ID, jobId]
  );

  const hb = startHeartbeat(jobId);
  const start = Date.now();

  try {
    const handler = handlers[job.name] || handlers.default;
    await handler(job.payload || {});

    stopHeartbeat(hb);
    const duration = Date.now() - start;
    await db.query(`UPDATE jobs SET status = 'done', error = NULL WHERE id = $1`, [jobId]);
    console.log(`[worker] ✓ job ${jobId.slice(0,8)}… done in ${duration}ms`);
    // Notify workflow engine if this is a workflow step
    const payload = job.payload || {};
    if (payload._workflow_id) {
      notifyWorkflow(payload._workflow_id, payload._step_id, true, null);
    }

  } catch (err) {
    stopHeartbeat(hb);
    const duration = Date.now() - start;
    console.error(`[worker] ✗ job ${jobId.slice(0,8)}… failed after ${duration}ms:`, err.message);

    if (job.attempts + 1 >= job.max_attempts) {
      await db.query(
        `UPDATE jobs SET status = 'failed', error = $1 WHERE id = $2`,
        [err.message, jobId]
      );
      console.log(`[worker] job ${jobId.slice(0,8)}… permanently failed after ${job.max_attempts} attempts`);
      const p = job.payload || {};
      if (p._workflow_id) notifyWorkflow(p._workflow_id, p._step_id, false, err.message);
    } else {
      const backoffMs = Math.pow(2, job.attempts) * 1000;
      const runAt = new Date(Date.now() + backoffMs);
      await db.query(
        `UPDATE jobs SET status = 'retrying', error = $1, run_at = $2 WHERE id = $3`,
        [err.message, runAt, jobId]
      );
      console.log(`[worker] job ${jobId.slice(0,8)}… retrying in ${backoffMs / 1000}s`);
      setTimeout(async () => {
        await redis.lpush(`queue:${job.queue}`, jobId);
        await db.query(`UPDATE jobs SET status = 'pending' WHERE id = $1`, [jobId]);
      }, backoffMs);
    }
  }
}


// ── Workflow Step Callback ─────────────────────────────────
// Notify the API that a workflow step finished so it can advance the DAG
function notifyWorkflow(workflowId, stepId, success, error) {
  const body = JSON.stringify({ workflow_id: workflowId, step_id: stepId, success, error });
  const req = http.request({
    hostname: 'localhost', port: 3000,
    path: '/internal/step-complete', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  });
  req.on('error', (e) => console.error('[workflow] callback error:', e.message));
  req.write(body);
  req.end();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

process.on('SIGTERM', () => { console.log('[worker] shutting down'); process.exit(0); });
process.on('SIGINT',  () => { console.log('[worker] shutting down'); process.exit(0); });

run();