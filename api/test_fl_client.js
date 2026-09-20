const assert = require('assert');
const { registerClient, getClients, updateHeartbeat, updateClientStatusAndStats } = require('./flClient');

async function testFLClientRegistry() {
  console.log('--- Running FL Client Registry Verification ---');

  // 1. Test validation failure when client_id is missing
  try {
    await registerClient({ name: 'Node 1' });
    assert.fail('Should have failed without client_id');
  } catch (err) {
    assert.strictEqual(err.message, 'client_id is required');
    console.log('✓ Correctly rejected missing client_id');
  }

  // 2. Test validation failure when cpu_capability is missing
  try {
    await registerClient({ client_id: 'c-101', name: 'Node 1' });
    assert.fail('Should have failed without cpu_capability');
  } catch (err) {
    assert.strictEqual(err.message, 'cpu_capability is required and must be an object');
    console.log('✓ Correctly rejected missing cpu_capability');
  }

  // 3. Test heartbeat validation with missing client_id
  try {
    await updateHeartbeat('');
    assert.fail('Should have failed without client_id');
  } catch (err) {
    assert.strictEqual(err.message, 'client_id is required');
    console.log('✓ Heartbeat correctly rejected missing client_id');
  }

  // 4. Test heartbeat validation with invalid status
  try {
    await updateHeartbeat('c-101', 'invalid_status');
    assert.fail('Should have failed with invalid status');
  } catch (err) {
    assert(err.message.includes('Invalid status'), 'Error message should complain about status');
    console.log('✓ Heartbeat correctly rejected invalid status');
  }

  // 5. Test client status update validation with invalid status
  try {
    await updateClientStatusAndStats('c-101', { status: 'unknown_status' });
    assert.fail('Should have failed with invalid status');
  } catch (err) {
    assert(err.message.includes('Invalid status'), 'Error message should complain about status');
    console.log('✓ Status/stats update correctly rejected invalid status');
  }

  console.log('✓ Module loaded and validation verified');
  console.log('--- Unit Verification Passed Successfully! ---');
  process.exit(0);
}

testFLClientRegistry().catch(err => {
  console.error('Test Execution Failed:', err.message);
  process.exit(1);
});

