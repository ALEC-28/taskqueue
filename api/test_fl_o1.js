const assert = require('assert');
const { query } = require('./db');
const {
  registerClient,
  getClients,
  updateHeartbeat,
  detectStaleClients,
  updateClientStatusAndStats
} = require('./flClient');

async function runFL_O1_Tests() {
  console.log('====================================================');
  console.log('  FL Orchestrator (O1) Core Verification Suite');
  console.log('====================================================\n');

  // Clean up previous test clients
  await query(`DELETE FROM fl_clients WHERE client_id IN ('fl-node-001', 'fl-node-002')`);

  // 1. Client Registration Test
  console.log('[Test 1] Registering FL Clients...');
  const client1 = await registerClient({
    client_id: 'fl-node-001',
    name: 'FL Worker Edge Node 1',
    cpu_capability: { cores: 8, frequency_ghz: 3.2 },
    memory_capability: { ram_gb: 16 },
    gpu_capability: { vram_gb: 8, model: 'RTX 3060' },
    status: 'available',
  });
  assert.strictEqual(client1.client_id, 'fl-node-001');
  assert.strictEqual(client1.status, 'available');
  console.log('  ✓ Client fl-node-001 registered successfully');

  const client2 = await registerClient({
    client_id: 'fl-node-002',
    name: 'FL Worker Edge Node 2',
    cpu_capability: { cores: 4, frequency_ghz: 2.4 },
    memory_capability: { ram_gb: 8 },
    status: 'available',
  });
  assert.strictEqual(client2.client_id, 'fl-node-002');
  console.log('  ✓ Client fl-node-002 registered successfully\n');

  // 2. FL Client Heartbeat Endpoint Logic Test
  console.log('[Test 2] FL Client Heartbeat updates...');
  const hbTimeBefore = new Date(client1.last_heartbeat).getTime();
  await new Promise(r => setTimeout(r, 100)); // small delay to ensure timestamp progression
  const updatedClient1 = await updateHeartbeat('fl-node-001', 'busy');
  const hbTimeAfter = new Date(updatedClient1.last_heartbeat).getTime();
  assert(hbTimeAfter >= hbTimeBefore, 'last_heartbeat timestamp should increase');
  assert.strictEqual(updatedClient1.status, 'busy');
  console.log('  ✓ Client heartbeat updated timestamp and status to busy\n');

  // 3. Stale Client Detection Test
  console.log('[Test 3] Stale Client Detection...');
  // Force client2 heartbeat into the past (40s ago)
  await query(
    `UPDATE fl_clients SET last_heartbeat = now() - interval '40 seconds', status = 'available' WHERE client_id = $1`,
    ['fl-node-002']
  );
  const staleList = await detectStaleClients(30);
  assert(staleList.some(c => c.client_id === 'fl-node-002'), 'fl-node-002 should be marked stale/offline');
  
  const [refetchedClient2] = await query(`SELECT * FROM fl_clients WHERE client_id = $1`, ['fl-node-002']);
  assert.strictEqual(refetchedClient2.status, 'offline');
  console.log('  ✓ Stale client correctly detected and marked offline\n');

  // 4. Task Execution Stats & Failure Integration Test
  console.log('[Test 4] FL Task Success & Failure Stat Updates...');
  const clientStats1 = await updateClientStatusAndStats('fl-node-001', {
    status: 'available',
    incrementSuccess: true,
  });
  assert.strictEqual(parseInt(clientStats1.successful_task_count, 10), 1);
  console.log('  ✓ Client successful_task_count incremented to 1');

  const clientStats2 = await updateClientStatusAndStats('fl-node-001', {
    status: 'unhealthy',
    incrementFailure: true,
  });
  assert.strictEqual(parseInt(clientStats2.failure_count, 10), 1);
  assert.strictEqual(clientStats2.status, 'unhealthy');
  console.log('  ✓ Client failure_count incremented to 1 and status marked unhealthy\n');

  console.log('====================================================');
  console.log('  ✓ ALL Objective O1 Verification Tests Passed!');
  console.log('====================================================\n');
  process.exit(0);
}

runFL_O1_Tests().catch(err => {
  console.error('\n❌ Test Execution Failed:', err);
  process.exit(1);
});
