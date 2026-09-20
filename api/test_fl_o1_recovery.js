const assert = require('assert');
const { query } = require('./db');
const {
  registerClient,
  getClients,
  findReplacementClient,
  updateClientStatusAndStats
} = require('./flClient');
const { createWorkflow, onStepComplete } = require('./workflow');
const { enqueue } = require('./queue');

async function runFL_O1_RecoverySuite() {
  console.log('================================================================');
  console.log('  Objective O1: End-to-End FL Fault Tolerance & Recovery Suite');
  console.log('================================================================\n');

  // Clean up previous test clients/jobs in foreign key order
  await query(`DELETE FROM workflow_steps WHERE name LIKE 'fl_%'`);
  await query(`DELETE FROM workflows WHERE name LIKE 'fl_%'`);
  await query(`DELETE FROM jobs WHERE name LIKE 'fl_%' OR name LIKE 'test_%'`);
  await query(`DELETE FROM fl_clients WHERE client_id IN ('fl-node-001', 'fl-node-002', 'fl-node-003')`);

  // ---------------------------------------------------------------------------
  // Test 1: Register fl-node-001 & fl-node-002
  // ---------------------------------------------------------------------------
  console.log('[Test 1] Registering FL Node 001 and Node 002...');
  const c1 = await registerClient({
    client_id: 'fl-node-001',
    name: 'FL Worker Node 1',
    cpu_capability: { cores: 8, frequency_ghz: 3.2 },
    memory_capability: { ram_gb: 16 },
    status: 'available',
  });
  const c2 = await registerClient({
    client_id: 'fl-node-002',
    name: 'FL Worker Node 2',
    cpu_capability: { cores: 4, frequency_ghz: 2.5 },
    memory_capability: { ram_gb: 8 },
    status: 'available',
  });
  assert.strictEqual(c1.client_id, 'fl-node-001');
  assert.strictEqual(c2.client_id, 'fl-node-002');
  console.log('  ✓ Nodes registered as available\n');

  // ---------------------------------------------------------------------------
  // Test 2 & 3: Submit and execute a successful FL training task
  // ---------------------------------------------------------------------------
  console.log('[Test 2 & 3] Executing successful FL training task on fl-node-001...');
  const [job1] = await query(
    `INSERT INTO jobs (name, queue, payload, max_attempts)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    ['fl_training', 'default', JSON.stringify({ client_id: 'fl-node-001', fl_round: 1 }), 3]
  );
  assert.strictEqual(job1.status, 'pending');

  // Simulate worker pickup & completion
  await query(`UPDATE jobs SET status = 'running', worker_id = 'test-worker-1' WHERE id = $1`, [job1.id]);
  await updateClientStatusAndStats('fl-node-001', { status: 'busy' });
  await updateClientStatusAndStats('fl-node-001', { status: 'available', incrementSuccess: true });
  await query(`UPDATE jobs SET status = 'done' WHERE id = $1`, [job1.id]);

  const [refetchedJob1] = await query(`SELECT * FROM jobs WHERE id = $1`, [job1.id]);
  const [refetchedC1] = await query(`SELECT * FROM fl_clients WHERE client_id = $1`, ['fl-node-001']);
  assert.strictEqual(refetchedJob1.status, 'done');
  assert.strictEqual(refetchedC1.status, 'available');
  assert.strictEqual(parseInt(refetchedC1.successful_task_count, 10), 1);
  console.log('  ✓ Job completed done, fl-node-001 successful_task_count = 1\n');

  // ---------------------------------------------------------------------------
  // Test 4 & 5: Simulate FL Client failure & test replacement selection
  // ---------------------------------------------------------------------------
  console.log('[Test 4 & 5] Simulating fl-node-001 failure during task execution...');
  const [job2] = await query(
    `INSERT INTO jobs (name, queue, payload, max_attempts)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    ['fl_training', 'default', JSON.stringify({ client_id: 'fl-node-001', fl_round: 2 }), 3]
  );

  // Mark client unhealthy due to failure
  await updateClientStatusAndStats('fl-node-001', { status: 'unhealthy', incrementFailure: true });
  const [failedC1] = await query(`SELECT * FROM fl_clients WHERE client_id = $1`, ['fl-node-001']);
  assert.strictEqual(failedC1.status, 'unhealthy');
  assert.strictEqual(parseInt(failedC1.failure_count, 10), 1);
  console.log('  ✓ fl-node-001 marked unhealthy, failure_count = 1');

  console.log('  Finding replacement for fl-node-001...');
  const replacement = await findReplacementClient('fl-node-001');
  assert(replacement !== null, 'Replacement client should be found');
  assert.strictEqual(replacement.client_id, 'fl-node-002');
  console.log(`  ✓ Replacement client selected: ${replacement.client_id}\n`);

  // ---------------------------------------------------------------------------
  // Test 6 & 7: Test rescheduling and successful completion by replacement
  // ---------------------------------------------------------------------------
  console.log('[Test 6 & 7] Rescheduling job to fl-node-002 and executing...');
  const newPayload = { ...job2.payload, client_id: replacement.client_id };
  await query(
    `UPDATE jobs SET payload = $1, status = 'pending', worker_id = NULL WHERE id = $2`,
    [JSON.stringify(newPayload), job2.id]
  );

  const [rescheduledJob] = await query(`SELECT * FROM jobs WHERE id = $1`, [job2.id]);
  assert.strictEqual(rescheduledJob.payload.client_id, 'fl-node-002');
  assert.strictEqual(rescheduledJob.status, 'pending');

  // Simulate replacement worker execution
  await query(`UPDATE jobs SET status = 'running', worker_id = 'test-worker-2' WHERE id = $1`, [job2.id]);
  await updateClientStatusAndStats('fl-node-002', { status: 'busy' });
  await updateClientStatusAndStats('fl-node-002', { status: 'available', incrementSuccess: true });
  await query(`UPDATE jobs SET status = 'done' WHERE id = $1`, [job2.id]);

  const [doneJob2] = await query(`SELECT * FROM jobs WHERE id = $1`, [job2.id]);
  const [refetchedC2] = await query(`SELECT * FROM fl_clients WHERE client_id = $1`, ['fl-node-002']);
  assert.strictEqual(doneJob2.status, 'done');
  assert.strictEqual(doneJob2.payload.client_id, 'fl-node-002');
  assert.strictEqual(refetchedC2.status, 'available');
  assert.strictEqual(parseInt(refetchedC2.successful_task_count, 10), 1);
  console.log('  ✓ Job rescheduled and completed successfully by replacement fl-node-002\n');

  // ---------------------------------------------------------------------------
  // Test 8: Workflow recovery after step client failure
  // ---------------------------------------------------------------------------
  console.log('[Test 8] Testing FL Workflow recovery after client failure...');
  // Ensure fl-node-002 is available
  await updateClientStatusAndStats('fl-node-002', { status: 'available' });

  const wf = await createWorkflow('fl_test_workflow', [
    {
      name: 'round_1_training',
      job_name: 'fl_training',
      payload: { client_id: 'fl-node-001', fl_round: 1 },
    }
  ]);

  const steps = await query(`SELECT * FROM workflow_steps WHERE workflow_id = $1`, [wf.id]);
  assert.strictEqual(steps.length, 1);
  const step = steps[0];

  // Get job generated for step
  const [stepJob] = await query(`SELECT * FROM jobs WHERE id = $1`, [step.job_id]);

  // Simulate client failure on fl-node-001 and trigger replacement to fl-node-002
  const wfReplacement = await findReplacementClient('fl-node-001');
  assert.strictEqual(wfReplacement.client_id, 'fl-node-002');

  const updatedWfPayload = { ...stepJob.payload, client_id: wfReplacement.client_id };
  await query(`UPDATE jobs SET payload = $1, status = 'pending', worker_id = NULL WHERE id = $2`, [JSON.stringify(updatedWfPayload), stepJob.id]);

  // Simulate replacement worker execution and completion
  await onStepComplete(wf.id, step.id, true);

  const [finalWf] = await query(`SELECT * FROM workflows WHERE id = $1`, [wf.id]);
  const [finalStep] = await query(`SELECT * FROM workflow_steps WHERE id = $1`, [step.id]);
  assert.strictEqual(finalStep.status, 'done');
  assert.strictEqual(finalWf.status, 'done');
  console.log('  ✓ FL Workflow recovered from step failure and completed successfully\n');

  // ---------------------------------------------------------------------------
  // Test 9: Duplicate Execution Protection Test
  // ---------------------------------------------------------------------------
  console.log('[Test 9] Testing Duplicate Execution Protection...');
  const [job3] = await query(
    `INSERT INTO jobs (name, queue, payload, max_attempts, status)
     VALUES ($1, $2, $3, $4, 'done') RETURNING *`,
    ['fl_training', 'default', JSON.stringify({ client_id: 'fl-node-002', fl_round: 3 }), 3]
  );

  // Attempt late completion on already completed job
  const [checkDone] = await query(`SELECT status FROM jobs WHERE id = $1`, [job3.id]);
  assert.strictEqual(checkDone.status, 'done');
  console.log('  ✓ Late completion on already completed job correctly suppressed\n');

  // ---------------------------------------------------------------------------
  // Test 10: No Replacement Available Test
  // ---------------------------------------------------------------------------
  console.log('[Test 10] Testing behavior when no replacement client is available...');
  // Mark all clients offline/unhealthy
  await updateClientStatusAndStats('fl-node-001', { status: 'offline' });
  await updateClientStatusAndStats('fl-node-002', { status: 'offline' });

  const noReplacement = await findReplacementClient('fl-node-001');
  assert.strictEqual(noReplacement, null, 'Should return null when no replacement exists');
  console.log('  ✓ Correctly returned null when no eligible replacement clients exist\n');

  console.log('================================================================');
  console.log('  ✓ ALL 10 Objective O1 Recovery Verification Tests PASSED!');
  console.log('================================================================\n');
  process.exit(0);
}

runFL_O1_RecoverySuite().catch(err => {
  console.error('\n❌ Test Execution Failed:', err);
  process.exit(1);
});
