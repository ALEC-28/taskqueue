const { startScheduler } = require('./scheduler');
const { startWebSocketServer, broadcastJobUpdate } = require('./ws');
const express = require('express');
const cors = require('cors');
const { query } = require('./db');
const { enqueue } = require('./queue');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/jobs', async (req, res) => {
  const { name, queue = 'default', payload = {}, max_attempts = 5 } = req.body;
  const delay_seconds = parseInt(req.body.delay_seconds || 0, 10);

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const [job] = await query(
      `INSERT INTO jobs (name, queue, payload, max_attempts, run_at)
       VALUES ($1, $2, $3, $4, now() + ($5 || ' seconds')::interval)
       RETURNING id, name, queue, status, created_at, run_at`,
      [name, queue, JSON.stringify(payload), max_attempts, delay_seconds]
    );

    if (delay_seconds === 0) await enqueue(queue, job.id);
    else console.log(`[api] delayed job ${job.id} scheduled in ${delay_seconds}s`);

    console.log(`[api] job created: ${job.id} (${name})`);
    broadcastJobUpdate(job);
    res.status(201).json(job);
  } catch (err) {
    console.error('[api] POST /jobs error:', err.message);
    res.status(500).json({ error: 'failed to create job' });
  }
});

app.get('/jobs/:id', async (req, res) => {
  try {
    const [job] = await query(
      `SELECT id, name, queue, status, attempts, max_attempts,
              error, worker_id, payload, created_at, updated_at
       FROM jobs WHERE id = $1`,
      [req.params.id]
    );

    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json(job);
  } catch (err) {
    console.error('[api] GET /jobs/:id error:', err.message);
    res.status(500).json({ error: 'failed to fetch job' });
  }
});

app.get('/jobs', async (req, res) => {
  try {
    const { status, queue, limit = 50 } = req.query;
    let sql = `SELECT id, name, queue, status, attempts, created_at, updated_at
               FROM jobs WHERE 1=1`;
    const params = [];

    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    if (queue)  { params.push(queue);  sql += ` AND queue  = $${params.length}`; }

    params.push(parseInt(limit));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const jobs = await query(sql, params);
    res.json(jobs);
  } catch (err) {
    console.error('[api] GET /jobs error:', err.message);
    res.status(500).json({ error: 'failed to list jobs' });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

app.get('/workers', async (req, res) => {
  try {
    const workers = await query(
      `SELECT DISTINCT ON (worker_id) worker_id, id as current_job_id, updated_at as last_heartbeat
       FROM jobs
       WHERE worker_id IS NOT NULL
       ORDER BY worker_id, updated_at DESC`
    );
    res.json(workers);
  } catch (err) {
    console.error('[api] GET /workers error:', err.message);
    res.status(500).json({ error: 'failed to fetch workers' });
  }
});

const { registerClient, getClients, updateHeartbeat } = require('./flClient');

app.post('/fl/clients/register', async (req, res) => {
  try {
    const client = await registerClient(req.body);
    console.log(`[api] FL client registered: ${client.client_id} (${client.name})`);
    res.status(201).json(client);
  } catch (err) {
    console.error('[api] POST /fl/clients/register error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.get('/fl/clients', async (req, res) => {
  try {
    const clients = await getClients(req.query);
    res.json(clients);
  } catch (err) {
    console.error('[api] GET /fl/clients error:', err.message);
    res.status(500).json({ error: 'failed to list FL clients' });
  }
});

app.post('/fl/clients/:client_id/heartbeat', async (req, res) => {
  try {
    const { client_id } = req.params;
    const { status } = req.body || {};
    const client = await updateHeartbeat(client_id, status);
    console.log(`[api] FL client heartbeat: ${client.client_id} (status: ${client.status})`);
    res.json(client);
  } catch (err) {
    console.error(`[api] POST /fl/clients/${req.params.client_id}/heartbeat error:`, err.message);
    const statusCode = err.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({ error: err.message });
  }
});

app.post('/fl/clients/heartbeat', async (req, res) => {
  try {
    const { client_id, status } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id is required' });
    const client = await updateHeartbeat(client_id, status);
    console.log(`[api] FL client heartbeat: ${client.client_id} (status: ${client.status})`);
    res.json(client);
  } catch (err) {
    console.error('[api] POST /fl/clients/heartbeat error:', err.message);
    const statusCode = err.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({ error: err.message });
  }
});

app.post('/fl/jobs/training', async (req, res) => {
  const { client_id, fl_round, queue = 'default', max_attempts = 5, ...extraPayload } = req.body;

  if (!client_id) {
    return res.status(400).json({ error: 'client_id is required' });
  }
  if (fl_round === undefined || fl_round === null) {
    return res.status(400).json({ error: 'fl_round is required' });
  }

  const payload = {
    client_id,
    fl_round,
    ...extraPayload,
  };

  try {
    const [job] = await query(
      `INSERT INTO jobs (name, queue, payload, max_attempts, run_at)
       VALUES ($1, $2, $3, $4, now())
       RETURNING id, name, queue, status, created_at, run_at`,
      ['fl_training', queue, JSON.stringify(payload), max_attempts]
    );

    await enqueue(queue, job.id);
    console.log(`[api] FL training job created: ${job.id} for client ${client_id}, round ${fl_round}`);
    broadcastJobUpdate(job);
    res.status(201).json(job);
  } catch (err) {
    console.error('[api] POST /fl/jobs/training error:', err.message);
    res.status(500).json({ error: 'failed to create FL training job' });
  }
});



const PORT = process.env.PORT || 3000;
startWebSocketServer();
startScheduler();
app.listen(PORT, () => console.log(`[api] listening on http://localhost:${PORT}`));

const { createWorkflow } = require('./workflow');

app.post('/workflows', async (req, res) => {
  const { name, steps } = req.body;
  if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'name and steps[] are required' });
  }
  try {
    const workflow = await createWorkflow(name, steps);
    res.status(201).json(workflow);
  } catch (err) {
    console.error('[api] POST /workflows error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.get('/workflows/:id', async (req, res) => {
  try {
    const [workflow] = await query(
      `SELECT * FROM workflows WHERE id = $1`, [req.params.id]
    );
    if (!workflow) return res.status(404).json({ error: 'workflow not found' });

    const steps = await query(
      `SELECT ws.*, j.status as job_status, j.error as job_error
       FROM workflow_steps ws
       LEFT JOIN jobs j ON j.id = ws.job_id
       WHERE ws.workflow_id = $1
       ORDER BY ws.created_at`,
      [req.params.id]
    );

    res.json({ ...workflow, steps });
  } catch (err) {
    console.error('[api] GET /workflows/:id error:', err.message);
    res.status(500).json({ error: 'failed to fetch workflow' });
  }
});

app.get('/workflows', async (req, res) => {
  try {
    const workflows = await query(
      `SELECT w.*, COUNT(ws.id)::int AS step_count
       FROM workflows w
       LEFT JOIN workflow_steps ws ON ws.workflow_id = w.id
       GROUP BY w.id
       ORDER BY w.created_at DESC LIMIT 20`
    );
    res.json(workflows);
  } catch (err) {
    res.status(500).json({ error: 'failed to list workflows' });
  }
});

const { onStepComplete } = require('./workflow');

app.post('/internal/step-complete', async (req, res) => {
  const { workflow_id, step_id, success, error } = req.body;
  try {
    await onStepComplete(workflow_id, step_id, success, error);
    const jobs = await query('SELECT * FROM jobs WHERE id = (SELECT job_id FROM workflow_steps WHERE id = $1)', [step_id]);
    if (jobs[0]) broadcastJobUpdate(jobs[0]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api] step-complete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const { generateWorkflowFromText } = require('./ai');

app.post('/workflows/generate', async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: 'description is required' });
  try {
    console.log('[api] NL workflow request:', description);
    const workflowDef = await generateWorkflowFromText(description);
    const workflow = await createWorkflow(workflowDef.name, workflowDef.steps);
    res.status(201).json({ workflow, generated: workflowDef });
  } catch (err) {
    console.error('[api] /workflows/generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/jobs/:id/requeue', async (req, res) => {
  try {
    const [job] = await query(
      `UPDATE jobs SET status = 'pending', attempts = 0, error = NULL, run_at = NULL
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!job) return res.status(404).json({ error: 'job not found' });
    await enqueue(job.queue, job.id);
    broadcastJobUpdate(job);
    console.log(`[api] job ${job.id} requeued manually`);
    res.json(job);
  } catch (err) {
    console.error('[api] requeue error:', err.message);
    res.status(500).json({ error: 'failed to requeue job' });
  }
});

const { findReplacementClient } = require('./flClient');
const { broadcastClientUpdate, broadcastEvent } = require('./ws');

app.get('/fl/status', async (req, res) => {
  try {
    const clients = await query(`SELECT status, count(*)::int FROM fl_clients GROUP BY status`);
    const jobs = await query(`SELECT status, count(*)::int FROM jobs WHERE name = 'fl_training' GROUP BY status`);
    const rounds = await query(`SELECT MAX((payload->>'fl_round')::int) as max_round FROM jobs WHERE name = 'fl_training'`);

    const clientStats = { total: 0, available: 0, busy: 0, unhealthy: 0, offline: 0 };
    clients.forEach(c => {
      clientStats.total += c.count;
      if (c.status === 'available') clientStats.available = c.count;
      else if (c.status === 'busy') clientStats.busy = c.count;
      else if (c.status === 'unhealthy') clientStats.unhealthy = c.count;
      else if (c.status === 'offline') clientStats.offline = c.count;
    });

    const jobStats = { total: 0, done: 0, running: 0, pending: 0, retrying: 0, failed: 0 };
    jobs.forEach(j => {
      jobStats.total += j.count;
      if (j.status in jobStats) jobStats[j.status] = j.count;
    });

    res.json({
      clients: clientStats,
      jobs: jobStats,
      current_round: (rounds[0] && rounds[0].max_round) ? rounds[0].max_round : 1
    });
  } catch (err) {
    console.error('[api] GET /fl/status error:', err.message);
    res.status(500).json({ error: 'failed to fetch FL status' });
  }
});

app.get('/fl/activity', async (req, res) => {
  try {
    const recentJobs = await query(`
      SELECT id, name, status, error, payload, created_at, updated_at
      FROM jobs
      ORDER BY updated_at DESC
      LIMIT 20
    `);
    res.json(recentJobs);
  } catch (err) {
    console.error('[api] GET /fl/activity error:', err.message);
    res.status(500).json({ error: 'failed to fetch activity' });
  }
});

app.post('/fl/simulate-failure', async (req, res) => {
  try {
    let targetClientId = req.body ? req.body.client_id : null;

    if (!targetClientId) {
      const candidates = await query(`SELECT client_id FROM fl_clients WHERE status IN ('busy', 'available') ORDER BY status DESC LIMIT 1`);
      if (candidates.length > 0) targetClientId = candidates[0].client_id;
    }

    if (!targetClientId) {
      return res.status(400).json({ error: 'No active FL client available to simulate failure.' });
    }

    const [failedClient] = await query(`
      UPDATE fl_clients
      SET status = 'unhealthy', failure_count = failure_count + 1, last_heartbeat = now()
      WHERE client_id = $1
      RETURNING *
    `, [targetClientId]);

    if (failedClient) broadcastClientUpdate(failedClient);

    const activeJobs = await query(`
      SELECT * FROM jobs
      WHERE name = 'fl_training' AND status IN ('running', 'pending')
        AND (payload->>'client_id') = $1
      LIMIT 1
    `, [targetClientId]);

    let replacementClient = null;
    let rescheduledJob = null;

    if (activeJobs.length > 0) {
      const job = activeJobs[0];
      replacementClient = await findReplacementClient(targetClientId);

      if (replacementClient) {
        const updatedPayload = { ...job.payload, client_id: replacementClient.client_id };
        const [updatedJob] = await query(`
          UPDATE jobs
          SET payload = $1, status = 'pending', worker_id = NULL, error = $2
          WHERE id = $3
          RETURNING *
        `, [
          JSON.stringify(updatedPayload),
          `Simulated failure on ${targetClientId}; reassigned to ${replacementClient.client_id}`,
          job.id
        ]);

        await enqueue(job.queue, job.id);
        rescheduledJob = updatedJob;
        broadcastJobUpdate(updatedJob);
      }
    }

    const eventMsg = {
      timestamp: new Date().toISOString(),
      type: 'client_failure_simulated',
      failed_client_id: targetClientId,
      replacement_client_id: replacementClient ? replacementClient.client_id : null,
      job_id: rescheduledJob ? rescheduledJob.id : null
    };
    broadcastEvent(eventMsg);

    res.json({
      ok: true,
      message: `Simulated failure on client '${targetClientId}'`,
      failed_client: failedClient,
      replacement_client: replacementClient,
      rescheduled_job: rescheduledJob
    });
  } catch (err) {
    console.error('[api] POST /fl/simulate-failure error:', err.message);
    res.status(500).json({ error: err.message });
  }
});