/**
 * flRound.js — FL Round Orchestration
 * =====================================
 * Manages the lifecycle of a single FL round:
 *  1. Create fl_rounds record
 *  2. Fetch active pool from fl_clients
 *  3. Run selection via clientSelector.selectClients
 *  4. Persist to fl_round_clients (NOT fl_selection_results)
 *  5. Enqueue fl_training jobs
 *  6. Decrement cooldown_rounds_left for all clients
 */

'use strict';

const { query } = require('./db');
const { enqueue } = require('./queue');
const { selectClients, getRoundClients, mulberry32, seedToUint32 } = require('./clientSelector');
const { scoreAllClients, DEFAULT_WEIGHTS } = require('./clientScoring');
const { getClientBehaviour } = require('./simulatedClients');
function shouldFail(seed, clientId, roundNumber, prob) {
  return seed != null
    ? mulberry32(seedToUint32(`${seed}-${clientId}-${roundNumber}`))() < prob
    : Math.random() < prob;
}
/**
 * createAndRunRound — main entry point for starting an FL round.
 *
 * @param {Object} options
 *   @param {number} options.round_number
 *   @param {number} options.k
 *   @param {string} options.strategy  'intelligent' | 'random' | 'epsilon_greedy'
 *   @param {Object} options.weights   weight override (optional)
 *   @param {number} options.duration_ms
 *   @param {number} options.fail_prob
 *   @param {string} options.queue
 *   @param {*}      options.seed      PRNG seed for reproducibility
 */
async function createAndRunRound({
  round_number,
  k = 3,
  strategy = 'intelligent',
  weights = DEFAULT_WEIGHTS,
  duration_ms = 800,
  fail_prob = 0,
  queue = 'default',
  seed = null,
} = {}) {
  if (round_number === undefined || round_number === null) {
    throw new Error('round_number is required');
  }
  if (!['intelligent', 'random', 'epsilon_greedy'].includes(strategy)) {
    throw new Error(`strategy must be 'intelligent', 'random', or 'epsilon_greedy'`);
  }
  const kNum = parseInt(k, 10);
  if (isNaN(kNum) || kNum < 1) throw new Error('k must be a positive integer');

  const startedAt = new Date();

  // 1. Create fl_rounds record
  const [round] = await query(
    `INSERT INTO fl_rounds (round_number, strategy, k, status, started_at)
     VALUES ($1, $2, $3, 'running', $4) RETURNING *`,
    [round_number, strategy, kNum, startedAt]
  );

  // 2. Fetch active pool
  const pool = await query(`SELECT * FROM fl_clients WHERE status = 'active'`);

  if (pool.length === 0) {
    await query(
      `UPDATE fl_rounds SET status = 'failed', completed_at = now() WHERE id = $1`,
      [round.id]
    );
    throw new Error('No FL clients registered. Register clients before starting a round.');
  }

  // 3. Run selection (writes to fl_round_clients)
  const selection = await selectClients({
    strategy, k: kNum, weights, pool, seed, roundId: round.id,
  });

  // 4. Enqueue fl_training jobs for each selected client
  const jobs = [];
  for (const scoredClient of selection.selected) {
    // Determine per-client failure probability from metadata
    const client = scoredClient._client || {};
    const behaviour = getClientBehaviour(client);
    const effectiveFailProb = parseFloat(fail_prob) || behaviour.dropout_prob || 0;

    const failNow = shouldFail(seed, scoredClient.client_id, round_number, effectiveFailProb);

    const [job] = await query(
      `INSERT INTO jobs (name, queue, payload, max_attempts, run_at)
       VALUES ($1, $2, $3, $4, now()) RETURNING id, name, queue, status, created_at`,
      [
        'fl_training',
        queue,
        JSON.stringify({
          client_id: scoredClient.client_id,
          fl_round: round_number,
          round_id: round.id,
          strategy,
          duration_ms: parseInt(duration_ms, 10) || 800,
          should_fail: failNow,
        }),
        5,
      ]
    );
    await enqueue(queue, job.id);
    jobs.push(job);
  }

  // 5. Decrement cooldown_rounds_left for all clients (round-based cooldown)
  await query(
    `UPDATE fl_clients SET cooldown_rounds_left = GREATEST(0, cooldown_rounds_left - 1)
     WHERE cooldown_rounds_left > 0`
  );

  // If no clients selected, mark failed
  if (selection.selected.length === 0) {
    await query(
      `UPDATE fl_rounds SET status = 'failed', completed_at = now() WHERE id = $1`,
      [round.id]
    );
  }

  console.log(
    `[fl-round] Round ${round_number} started | strategy=${strategy} | ` +
    `eligible=${selection.eligible_count}/${selection.total_count} | ` +
    `selected=${selection.k_selected}/${kNum} | jobs=${jobs.length}`
  );

  return { round, selection, jobs };
}

/**
 * getRoundDetail — fetch a round with its selection from fl_round_clients.
 */
async function getRoundDetail(roundId) {
  const [round] = await query(`SELECT * FROM fl_rounds WHERE id = $1`, [roundId]);
  if (!round) return null;
  const selectionResults = await getRoundClients(roundId);
  const roundJobs = await query(
    `SELECT id, status, payload, created_at, updated_at
     FROM jobs WHERE name = 'fl_training' AND (payload->>'round_id') = $1`,
    [roundId]
  );
  return { ...round, selection_results: selectionResults, jobs: roundJobs };
}

/**
 * listRounds — list all fl_rounds, newest first, with aggregate stats from fl_round_clients.
 */
async function listRounds(limit = 50) {
  return await query(
    `SELECT r.*,
       COUNT(rc.id)::int AS total_clients_scored,
       COUNT(CASE WHEN rc.selected THEN 1 END)::int AS clients_selected,
       AVG(CASE WHEN rc.selected THEN rc.score END)::numeric(5,4) AS avg_selected_score,
       AVG(CASE WHEN rc.selected THEN (rc.breakdown->>'reliability')::numeric END)::numeric(5,4) AS avg_selected_reliability
     FROM fl_rounds r
     LEFT JOIN fl_round_clients rc ON rc.round_id = r.id
     GROUP BY r.id
     ORDER BY r.created_at DESC
     LIMIT $1`,
    [limit]
  );
}

/**
 * getClientScores — score all active clients without starting a round.
 */
async function getClientScores(weights = DEFAULT_WEIGHTS) {
  const pool = await query(`SELECT * FROM fl_clients WHERE status = 'active'`);
  const allClients = await query(`SELECT * FROM fl_clients ORDER BY client_id`);
  return scoreAllClients(allClients, weights, pool);
}

/**
 * syncRoundStatus — check whether all fl_training jobs for a round are done/failed.
 */
async function syncRoundStatus(roundId) {
  const roundJobs = await query(
    `SELECT status FROM jobs
     WHERE name = 'fl_training' AND (payload->>'round_id') = $1`,
    [roundId]
  );

  if (roundJobs.length === 0) return null;

  const allDone = roundJobs.every(j => j.status === 'done');
  const anyFailed = roundJobs.some(j => j.status === 'failed');
  const allFinished = roundJobs.every(j => ['done', 'failed'].includes(j.status));

  let newStatus = 'running';
  if (allDone) newStatus = 'done';
  else if (allFinished && anyFailed) newStatus = 'failed';

  if (newStatus !== 'running') {
    await query(
      `UPDATE fl_rounds SET status = $1, completed_at = now() WHERE id = $2`,
      [newStatus, roundId]
    );
  }

  return { roundId, status: newStatus, jobs: roundJobs };
}

module.exports = {
  createAndRunRound,
  getRoundDetail,
  listRounds,
  getClientScores,
  syncRoundStatus,
  shouldFail,
};
