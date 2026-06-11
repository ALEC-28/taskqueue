const { query } = require('./db');
const { enqueue } = require('./queue');

// Runs every 5s — finds pending jobs whose run_at has passed and pushes them to Redis
async function pollDelayedJobs() {
  try {
    const dueJobs = await query(`
      SELECT id, queue FROM jobs
      WHERE status = 'pending'
        AND run_at IS NOT NULL
        AND run_at <= now()
      LIMIT 50
    `);

    for (const job of dueJobs) {
      // Clear run_at so we don't re-enqueue on next poll
      await query(`UPDATE jobs SET run_at = NULL WHERE id = $1`, [job.id]);
      await enqueue(job.queue, job.id);
      console.log(`[scheduler] ⏰ delayed job ${job.id.slice(0,8)}… due — enqueued to ${job.queue}`);
    }
  } catch (err) {
    console.error('[scheduler] error:', err.message);
  }
}

function startScheduler() {
  setInterval(pollDelayedJobs, 5000);
  console.log('[scheduler] delayed job scheduler running every 5s');
}

module.exports = { startScheduler };
