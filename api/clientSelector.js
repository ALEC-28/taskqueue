/**
 * clientSelector.js — FL Client Selection Engine
 * ================================================
 * Exports:
 *   selectClients({ strategy, k, weights, pool, seed, roundId })
 *   selectReplacement(roundId, failedClientId, db)
 *
 * Strategies:
 *   'intelligent'    — top-K by composite score (hard-excludes ineligible)
 *   'random'         — seeded PRNG (mulberry32) for reproducibility
 *   'epsilon_greedy' — top-(K-1) intelligent + 1 random non-top, ε=0.1
 *
 * Eligibility hard gate (isEligible from clientScoring):
 *   status === 'active' AND cooldown_rounds_left <= 0
 *
 * Persists selection to fl_round_clients (new table).
 * Legacy fl_selection_results is not touched.
 */

'use strict';

const { query } = require('./db');
const { scoreAllClients, isEligible,
  validateWeights, DEFAULT_WEIGHTS } = require('./clientScoring');

// ── Seeded PRNG — mulberry32 ──────────────────────────────────────────────────
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Converts any seed value to a uint32. String seeds are hashed via djb2.
function seedToUint32(seed) {
  if (seed === null || seed === undefined) {
    return (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
  }
  if (typeof seed === 'number') return seed >>> 0;
  const str = String(seed);
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

// Fisher-Yates shuffle with a seeded rng
function shuffleSeeded(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Main selection function ───────────────────────────────────────────────────

/**
 * selectClients — core selection algorithm.
 *
 * @param {Object} opts
 *   @param {string}   opts.strategy  'intelligent' | 'random' | 'epsilon_greedy'
 *   @param {number}   opts.k         number of clients to select
 *   @param {Object}   opts.weights   scoring weights (optional override)
 *   @param {Object[]} opts.pool      all fl_clients rows (active pool for normalisation)
 *   @param {*}        opts.seed      reproducibility seed (any value → uint32)
 *   @param {string}   [opts.roundId] if provided, persists selection to fl_round_clients
 *
 * @returns {{
 *   selected: Object[],
 *   all:      Object[],
 *   strategy: string,
 *   eligible_count: number,
 *   total_count: number,
 *   k_requested: number,
 *   k_selected: number,
 *   warning?: string,
 * }}
 */
async function selectClients({ strategy = 'intelligent', k = 3, weights = DEFAULT_WEIGHTS, pool = [], seed = null, roundId = null } = {}) {
  validateWeights(weights);

  if (!['intelligent', 'random', 'epsilon_greedy'].includes(strategy)) {
    throw { code: 400, message: `strategy must be 'intelligent', 'random', or 'epsilon_greedy'` };
  }

  const kNum = parseInt(k, 10);
  if (isNaN(kNum) || kNum < 1) throw { code: 400, message: 'k must be a positive integer' };

  // Score all clients using active pool for normalisation
  const scored = scoreAllClients(pool, weights, pool);
  // Hard eligibility gate
  const eligible = scored.filter(s => isEligible(s._client));
  const rng = mulberry32(seedToUint32(seed));

  let selected;
  const reason = {};

  if (strategy === 'intelligent') {
    selected = eligible.slice(0, kNum);
    selected.forEach(s => { reason[s.client_id] = 'top-k by score'; });

  } else if (strategy === 'random') {
    const shuffled = shuffleSeeded(eligible, rng);
    selected = shuffled.slice(0, kNum);
    selected.forEach(s => { reason[s.client_id] = 'random selection'; });

  } else {
    // epsilon_greedy: take top-(k-1) then inject 1 random non-top
    const epsilon = 0.1;
    if (eligible.length === 0) {
      selected = [];
    } else if (eligible.length <= kNum) {
      selected = eligible;
      selected.forEach(s => { reason[s.client_id] = 'epsilon_greedy (all eligible)'; });
    } else {
      const topK = eligible.slice(0, kNum);
      const nonTopK = eligible.slice(kNum);
      // Roll epsilon for each top slot; with probability ε replace with a random non-top
      const result = topK.slice(0, kNum - 1);
      result.forEach(s => { reason[s.client_id] = 'epsilon_greedy (greedy)'; });
      const shuffledNon = shuffleSeeded(nonTopK, rng);
      const exploit = rng() < epsilon && shuffledNon.length > 0 ? shuffledNon[0] : topK[kNum - 1];
      result.push(exploit);
      reason[exploit.client_id] = rng() < epsilon ? 'epsilon_greedy (explore)' : 'epsilon_greedy (greedy)';
      selected = result;
    }
  }

  const warning = selected.length < kNum
    ? `Only ${selected.length} eligible clients available (requested k=${kNum})`
    : undefined;

  // Mark selected flag on all
  const selectedIds = new Set(selected.map(s => s.client_id));
  scored.forEach(s => {
    s.selected = selectedIds.has(s.client_id);
    s.reason = reason[s.client_id] || (isEligible(s._client) ? 'not in top-k' : 'ineligible');
  });

  // Persist to fl_round_clients if roundId provided
  if (roundId) {
    await saveRoundClients(roundId, scored, weights, strategy);
  }

  return {
    selected,
    all: scored,
    strategy,
    eligible_count: eligible.length,
    total_count: pool.length,
    k_requested: kNum,
    k_selected: selected.length,
    ...(warning ? { warning } : {}),
  };
}

/**
 * saveRoundClients — persist full scoring+selection for a round.
 */
async function saveRoundClients(roundId, allScored, weights, strategy) {
  for (const s of allScored) {
    await query(
      `INSERT INTO fl_round_clients
         (round_id, client_id, score, breakdown, weights_used, rank, selected, reason, strategy)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT DO NOTHING`,
      [
        roundId,
        s.client_id,
        s.total,
        JSON.stringify(s.breakdown),
        JSON.stringify(weights),
        s.rank,
        s.selected || false,
        s.reason || null,
        strategy,
      ]
    );
  }
}

/**
 * getRoundClients — fetch scoring + selection for a round from fl_round_clients.
 */
async function getRoundClients(roundId) {
  return query(
    `SELECT rc.*, fc.name as client_name, fc.status as client_status,
            fc.cpu_cores, fc.ram_gb, fc.network_latency_ms, fc.dataset_size,
            fc.data_quality, fc.total_rounds, fc.successful_rounds
     FROM fl_round_clients rc
     LEFT JOIN fl_clients fc ON fc.client_id = rc.client_id
     WHERE rc.round_id = $1
     ORDER BY rc.rank ASC`,
    [roundId]
  );
}

/**
 * selectReplacement — next-best eligible client not already in the round.
 * Designed for use after a client failure during a round.
 *
 * @param {string}   roundId        UUID of the fl_rounds row
 * @param {string}   failedClientId client_id of the failed client
 * @param {Object[]} activePool     active fl_clients rows
 * @param {Object}   weights        scoring weights to use
 * @returns {Object|null} scored client or null if no replacement found
 */
async function selectReplacement(roundId, failedClientId, activePool, weights = DEFAULT_WEIGHTS) {
  // Clients already in this round
  const inRound = await query(
    `SELECT client_id FROM fl_round_clients WHERE round_id = $1`,
    [roundId]
  );
  const usedIds = new Set(inRound.map(r => r.client_id));
  usedIds.add(failedClientId);

  // Eligible clients not already in the round
  const candidates = activePool.filter(c => {
    const cid = c.client_id || c.id;
    return isEligible(c) && !usedIds.has(cid);
  });

  if (candidates.length === 0) return null;

  const scored = scoreAllClients(candidates, weights, activePool);
  return scored[0] || null; // highest scoring replacement
}

module.exports = {
  selectClients,
  saveRoundClients,
  getRoundClients,
  selectReplacement,
  mulberry32,
  seedToUint32,
};
