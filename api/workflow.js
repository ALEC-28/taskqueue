const { query } = require('./db');
const { enqueue } = require('./queue');

// ── Topological Sort ───────────────────────────────────────
// Takes the steps array, returns them in execution order
// respecting dependencies. Throws if a cycle is detected.
function topoSort(steps) {
  const nameToStep = {};
  steps.forEach(s => nameToStep[s.name] = s);

  const visited = new Set();
  const visiting = new Set(); // cycle detection
  const order = [];

  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`cycle detected at step: ${name}`);

    visiting.add(name);
    const step = nameToStep[name];
    if (!step) throw new Error(`unknown step referenced in depends_on: ${name}`);

    for (const dep of (step.depends_on || [])) {
      visit(dep);
    }

    visiting.delete(name);
    visited.add(name);
    order.push(step);
  }

  steps.forEach(s => visit(s.name));
  return order;
}

// ── Create & Start Workflow ────────────────────────────────
async function createWorkflow(name, steps) {
  // Validate DAG — will throw on cycles or missing deps
  topoSort(steps);

  // Insert workflow row
  const [workflow] = await query(
    `INSERT INTO workflows (name) VALUES ($1) RETURNING *`,
    [name]
  );

  // Insert all steps
  for (const step of steps) {
    await query(
      `INSERT INTO workflow_steps
         (workflow_id, name, job_name, queue, payload, depends_on)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        workflow.id,
        step.name,
        step.job_name,
        step.queue || 'default',
        JSON.stringify(step.payload || {}),
        step.depends_on || [],
      ]
    );
  }

  console.log(`[workflow] created ${workflow.id} (${name}) with ${steps.length} steps`);

  // Kick off execution
  await advanceWorkflow(workflow.id);

  return workflow;
}

// ── Advance Workflow ───────────────────────────────────────
// Called after every step completes. Finds all steps whose
// dependencies are satisfied and enqueues them.
async function advanceWorkflow(workflowId) {
  const steps = await query(
    `SELECT * FROM workflow_steps WHERE workflow_id = $1`,
    [workflowId]
  );

  const doneNames = new Set(
    steps.filter(s => s.status === 'done').map(s => s.name)
  );

  const failedSteps = steps.filter(s => s.status === 'failed');
  if (failedSteps.length > 0) {
    await query(
      `UPDATE workflows SET status = 'failed' WHERE id = $1`,
      [workflowId]
    );
    console.log(`[workflow] ${workflowId.slice(0,8)}… failed`);
    return;
  }

  // Find steps ready to run — pending + all deps done
  const ready = steps.filter(s =>
    s.status === 'pending' &&
    (s.depends_on || []).every(dep => doneNames.has(dep))
  );

  if (ready.length === 0) {
    // Check if everything is done
    const allDone = steps.every(s => s.status === 'done');
    if (allDone) {
      await query(
        `UPDATE workflows SET status = 'done' WHERE id = $1`,
        [workflowId]
      );
      console.log(`[workflow] ${workflowId.slice(0,8)}… completed all steps ✓`);
    }
    return;
  }

  console.log(`[workflow] ${workflowId.slice(0,8)}… enqueuing ${ready.length} ready step(s): ${ready.map(s=>s.name).join(', ')}`);

  // Enqueue all ready steps in parallel
  for (const step of ready) {
    // Create a job for this step
    const [job] = await query(
      `INSERT INTO jobs (name, queue, payload)
       VALUES ($1, $2, $3) RETURNING *`,
      [step.job_name, step.queue, JSON.stringify(step.payload || {})]
    );

    // Link step to job
    await query(
      `UPDATE workflow_steps SET status = 'running', job_id = $1 WHERE id = $2`,
      [job.id, step.id]
    );

    await query(
      `UPDATE workflows SET status = 'running' WHERE id = $1`,
      [workflowId]
    );

    // Store workflow context in job payload so worker can call back
    await query(
      `UPDATE jobs SET payload = payload || $1 WHERE id = $2`,
      [JSON.stringify({ _workflow_id: workflowId, _step_id: step.id }), job.id]
    );

    await enqueue(step.queue, job.id);
    console.log(`[workflow] step "${step.name}" → job ${job.id.slice(0,8)}…`);
  }
}

// ── Step Completion Callback ───────────────────────────────
// Called by the worker when a workflow job finishes.
async function onStepComplete(workflowId, stepId, success, error = null) {
  if (success) {
    await query(
      `UPDATE workflow_steps SET status = 'done' WHERE id = $1`,
      [stepId]
    );
    console.log(`[workflow] step ${stepId.slice(0,8)}… done — advancing workflow`);
    await advanceWorkflow(workflowId);
  } else {
    await query(
      `UPDATE workflow_steps SET status = 'failed' WHERE id = $1`,
      [stepId]
    );
    await query(
      `UPDATE workflows SET status = 'failed' WHERE id = $1`,
      [workflowId]
    );
    console.log(`[workflow] step ${stepId.slice(0,8)}… failed: ${error}`);
  }
}

module.exports = { createWorkflow, advanceWorkflow, onStepComplete };
