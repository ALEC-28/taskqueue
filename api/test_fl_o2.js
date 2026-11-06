/**
 * test_fl_o2.js — O2 integration + ranking tests (new schema)
 * Unit tests for scoring/selection/cooldown/import live in test_fl_clients.js.
 * Run: node test_fl_o2.js   (from api/, with Postgres + Redis up)
 */
require('dotenv').config();
const assert = require('assert');
const { query } = require('./db');
const { scoreAllClients, DEFAULT_WEIGHTS } = require('./clientScoring');
const { getRoundClients } = require('./clientSelector');
const { createAndRunRound, getClientScores } = require('./flRound');
const { registerSimulatedClients, clearSimulatedClients, refreshHeartbeats } = require('./simulatedClients');

let testsPassed = 0, testsFailed = 0;
const pass = n => { testsPassed++; console.log(`  ✓ ${n}`); };
const fail = (n, e) => { testsFailed++; console.error(`  ✗ ${n}\n    → ${e.message}`); };

function makeClient(o = {}) {
  return {
    client_id: 'test-client', name: 'Test Client', status: 'active',
    cpu_cores: 8, ram_gb: 16, network_latency_ms: 100, bandwidth_mbps: null,
    dataset_size: 5000, data_quality: 0.8,
    total_rounds: 100, successful_rounds: 80, failure_count: 20,
    consecutive_failures: 0, cooldown_rounds_left: 0,
    ...o,
  };
}

async function run() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  O2: Ranking + Round Integration (new schema)            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  await query(`DELETE FROM fl_rounds WHERE round_number IN (901,902,903)`); // cascades fl_round_clients
  await query(`DELETE FROM fl_clients WHERE client_id LIKE 'o2-test-%'`);
  await clearSimulatedClients().catch(() => { });

  console.log('[Test 1] scoreAllClients ranks high > mid > low');
  try {
    const ranked = scoreAllClients([
      makeClient({ client_id: 'low', total_rounds: 100, successful_rounds: 10, network_latency_ms: 400, data_quality: 0.3, dataset_size: 300 }),
      makeClient({ client_id: 'high', total_rounds: 100, successful_rounds: 95, network_latency_ms: 20, data_quality: 0.9, dataset_size: 9000 }),
      makeClient({ client_id: 'mid', total_rounds: 100, successful_rounds: 60, network_latency_ms: 150, data_quality: 0.6, dataset_size: 3000 }),
    ]);
    assert.deepStrictEqual(ranked.map(r => r.client_id), ['high', 'mid', 'low']);
    assert.deepStrictEqual(ranked.map(r => r.rank), [1, 2, 3]);
    assert(ranked[0].total > ranked[1].total && ranked[1].total > ranked[2].total);
    pass('ranking order and ranks correct');
  } catch (e) { fail('ranking order', e); }

  console.log('\n[Test 2] Reliability alone decides rank when other factors equal');
  try {
    const ranked = scoreAllClients([
      makeClient({ client_id: 'lrel', total_rounds: 100, successful_rounds: 30 }),
      makeClient({ client_id: 'hrel', total_rounds: 100, successful_rounds: 95 }),
    ]);
    assert.strictEqual(ranked[0].client_id, 'hrel');
    pass('high-reliability ranks first');
  } catch (e) { fail('reliability ranking', e); }

  console.log('\n[Test 3] Integration: round → jobs → fl_round_clients');
  try {
    const rows = [
      ['o2-test-c1', 8, 16, 50, 3000, 0.85, 90, 100],
      ['o2-test-c2', 4, 8, 100, 2000, 0.70, 70, 100],
      ['o2-test-c3', 2, 4, 200, 1000, 0.55, 50, 100],
    ];
    for (const [id, cpu, ram, lat, ds, dq, succ, tot] of rows) {
      await query(
        `INSERT INTO fl_clients (client_id, name, status, cpu_cores, ram_gb, network_latency_ms,
           dataset_size, data_quality, total_rounds, successful_rounds, failure_count, source)
         VALUES ($1,$1,'active',$2,$3,$4,$5,$6,$7,$8,$9,'manual')`,
        [id, cpu, ram, lat, ds, dq, tot, succ, tot - succ]);
    }
    const { round, selection, jobs } = await createAndRunRound({
      round_number: 901, k: 2, strategy: 'intelligent', duration_ms: 100, fail_prob: 0, seed: 1,
    });
    assert(round.id);
    assert.strictEqual(round.strategy, 'intelligent');
    assert.strictEqual(round.k, 2);
    assert.strictEqual(selection.selected.length, 2);
    assert.strictEqual(jobs.length, 2);

    const db = await getRoundClients(round.id);
    const sel = db.filter(r => r.selected);
    assert.strictEqual(sel.length, 2, `expected 2 selected rows, got ${sel.length}`);
    for (let i = 0; i < db.length - 1; i++)
      assert(parseFloat(db[i].score) >= parseFloat(db[i + 1].score), 'rows must be score-descending');
    // intelligent = top-k by score
    assert.deepStrictEqual(sel.map(r => r.client_id).sort(),
      db.slice(0, 2).map(r => r.client_id).sort());
    pass('round persisted to fl_round_clients, 2 jobs enqueued, top-k selected');
  } catch (e) { fail('integration', e); }

  console.log('\n[Test 4] Simulated clients register with seeded history');
  try {
    const registered = await registerSimulatedClients();
    assert.strictEqual(registered.length, 10);
    const db = await query(`SELECT * FROM fl_clients WHERE client_id LIKE 'fl-sim-%'`);
    assert.strictEqual(db.length, 10);
    const c1 = db.find(c => c.client_id === 'fl-sim-c1');
    assert(c1);
    assert.strictEqual(parseInt(c1.successful_rounds, 10), 95);
    assert.strictEqual(parseInt(c1.failure_count, 10), 5);
    pass('10 simulated clients with correct seeded counts');
  } catch (e) { fail('simulated clients', e); }

  console.log('\n[Test 5] getClientScores returns scored + ranked list');
  try {
    await refreshHeartbeats();
    const scores = await getClientScores();
    assert(scores.length >= 10);
    for (let i = 0; i < scores.length - 1; i++)
      assert(scores[i].total >= scores[i + 1].total);
    pass('getClientScores ranked correctly');
  } catch (e) { fail('getClientScores', e); }

  await query(`DELETE FROM fl_rounds WHERE round_number IN (901,902,903)`);
  await query(`DELETE FROM fl_clients WHERE client_id LIKE 'o2-test-%'`);

  const total = testsPassed + testsFailed;
  console.log(testsFailed === 0
    ? `\n✓ ALL ${testsPassed}/${total} O2 TESTS PASSED\n`
    : `\nRESULT: ${testsPassed}/${total} passed, ${testsFailed} FAILED\n`);
  process.exit(testsFailed > 0 ? 1 : 0);
}

run().catch(e => { console.error('\n❌ Test runner crashed:', e); process.exit(1); });
