const { query } = require('./db');
const { enqueue } = require('./queue');
const { detectStaleClients, findReplacementClient } = require('./flClient');

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

// Runs every 10s — finds FL clients with no heartbeat for >30s, marks them offline, and reschedules active FL jobs
async function checkStaleFLClients() {
  try {
    const staleClients = await detectStaleClients(30);
    if (staleClients.length > 0) {
      const ids = staleClients.map(c => c.client_id).join(', ');
      console.log(`[scheduler] ⚠️ Marked ${staleClients.length} FL client(s) offline (stale heartbeat): ${ids}`);

      for (const staleClient of staleClients) {
        // Find running FL jobs assigned to this stale client
        const activeJobs = await query(`
          SELECT * FROM jobs
          WHERE name = 'fl_training'
            AND status IN ('running', 'pending')
            AND (payload->>'client_id') = $1
        `, [staleClient.client_id]);

        for (const job of activeJobs) {
          const replacement = await findReplacementClient(staleClient.client_id);
          if (replacement) {
            console.log(`[scheduler] 🔄 Rescheduling FL job ${job.id.slice(0,8)} from stale client '${staleClient.client_id}' to replacement client '${replacement.client_id}'`);
            const updatedPayload = { ...job.payload, client_id: replacement.client_id };
            await query(`
              UPDATE jobs
              SET payload = $1, status = 'pending', worker_id = NULL, run_at = NULL, last_heartbeat = now()
              WHERE id = $2
            `, [JSON.stringify(updatedPayload), job.id]);
            await enqueue(job.queue, job.id);
          } else {
            console.log(`[scheduler] ⚠️ No replacement client available for stale job ${job.id.slice(0,8)} (client: ${staleClient.client_id})`);
          }
        }
      }
    }
  } catch (err) {
    console.error('[scheduler] FL health monitor error:', err.message);
  }
}

function startScheduler() {
  setInterval(pollDelayedJobs, 5000);
  setInterval(checkStaleFLClients, 10000);
  console.log('[scheduler] delayed job scheduler running every 5s');
  console.log('[scheduler] FL client health monitor running every 10s');
}

module.exports = { startScheduler, pollDelayedJobs, checkStaleFLClients };

