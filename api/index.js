const { startScheduler } = require('./scheduler');
const { startWebSocketServer, broadcastJobUpdate } = require('./ws');
const express = require('express');
const cors = require('cors');
const { query } = require('./db');
const { enqueue } = require('./queue');

const app = express();
app.use(cors());
app.use(express.json());

// ── POST /jobs ─────────────────────────────────────────────
// Submit a new job. Body: { name, queue?, payload?, max_attempts? }
// Returns: { id, name, queue, status, created_at }
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

    // Only push to Redis immediately if no delay — delayed jobs are picked up by scheduler
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

// ── GET /jobs/:id ──────────────────────────────────────────
// Get the current status of a job by its UUID
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

// ── GET /jobs ──────────────────────────────────────────────
// List recent jobs (latest 50) — used by dashboard
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

// ── GET /health ────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

const PORT = process.env.PORT || 3000;
startWebSocketServer();
startScheduler();
app.listen(PORT, () => console.log(`[api] listening on http://localhost:${PORT}`));

// ── Workflow Routes ────────────────────────────────────────
const { createWorkflow } = require('./workflow');

// POST /workflows — submit a workflow DAG
// Body: { name, steps: [{ name, job_name, queue?, payload?, depends_on? }] }
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

// GET /workflows/:id — get workflow + all step statuses
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

// GET /workflows — list all workflows
app.get('/workflows', async (req, res) => {
  try {
    const workflows = await query(
      `SELECT * FROM workflows ORDER BY created_at DESC LIMIT 20`
    );
    res.json(workflows);
  } catch (err) {
    res.status(500).json({ error: 'failed to list workflows' });
  }
});

// ── Internal Step Completion Callback ─────────────────────
// Called by workers when a workflow step finishes
const { onStepComplete } = require('./workflow');

app.post('/internal/step-complete', async (req, res) => {
  const { workflow_id, step_id, success, error } = req.body;
  try {
    await onStepComplete(workflow_id, step_id, success, error);
    // broadcast updated job to dashboard
    const jobs = await query('SELECT * FROM jobs WHERE id = (SELECT job_id FROM workflow_steps WHERE id = $1)', [step_id]);
    if (jobs[0]) broadcastJobUpdate(jobs[0]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api] step-complete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /workflows/generate ───────────────────────────────
// Natural language → DAG workflow using LLM
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

// ── POST /jobs/:id/requeue ─────────────────────────────────
// Reset a failed job and push it back onto its queue
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