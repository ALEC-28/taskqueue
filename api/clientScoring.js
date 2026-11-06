/**
 * clientScoring.js — FL Intelligent Client Scoring Engine
 * =========================================================
 * Formula (spec-exact):
 *   score = 0.35 × reliability
 *         + 0.25 × dataset_size
 *         + 0.20 × data_quality
 *         + 0.10 × compute
 *         + 0.10 × network
 *
 * All five factors are normalised to [0, 1].
 * Compute and dataset_size use pool-aware min-max (active pool only).
 * Weights are overridable per call; they must sum to 1 ± 1e-6.
 *
 * Key design decisions (per user amendments):
 *  - Pool = all status='active' clients (scores don't shift during cooldown).
 *  - Compute = 0.6×mm(cpu_cores) + 0.4×mm(ram_gb); if max==min → 0.5.
 *  - No "availability" factor — eligibility is a hard gate in clientSelector.js.
 *  - getScore(client, pool, weights) is the single exported scorer.
 */

'use strict';

// ── Default weights (must sum to 1.0) ────────────────────────────────────────
const DEFAULT_WEIGHTS = {
  reliability:  0.35,
  dataset_size: 0.25,
  data_quality: 0.20,
  compute:      0.10,
  network:      0.10,
};

// ── Constants ─────────────────────────────────────────────────────────────────
const WEIGHT_TOLERANCE = 1e-6;

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Min-max normalise a value given a pool min/max.
 * If max === min (all same), returns 0.5 (not 0 or 1 — avoids bias).
 */
function minMax(val, min, max) {
  if (max === min) return 0.5;
  return clamp((val - min) / (max - min));
}

/**
 * Validate weights object. Throws {code:400, message} on failure.
 */
function validateWeights(weights) {
  const keys = Object.keys(DEFAULT_WEIGHTS);
  for (const k of keys) {
    if (weights[k] === undefined || weights[k] === null) {
      throw { code: 400, message: `Missing weight key: ${k}` };
    }
    if (typeof weights[k] !== 'number' || weights[k] < 0) {
      throw { code: 400, message: `Weight '${k}' must be a non-negative number` };
    }
  }
  const sum = keys.reduce((s, k) => s + weights[k], 0);
  if (Math.abs(sum - 1.0) > WEIGHT_TOLERANCE) {
    throw {
      code: 400,
      message: `Weights must sum to 1.0 (got ${sum.toFixed(6)}). ` +
               `Adjust values or auto-normalise before calling.`,
    };
  }
}

// ── Pool statistics (computed once per scoring call) ─────────────────────────

/**
 * Compute min/max for pool-normalised factors across the active pool.
 * @param {Object[]} pool — all active fl_clients rows
 */
function computePoolStats(pool) {
  if (!pool || pool.length === 0) {
    return {
      cpu_min: 0, cpu_max: 1,
      ram_min: 0, ram_max: 1,
      latency_min: 0, latency_max: 1,
      bw_min: 0, bw_max: 1,
      ds_log_min: 0, ds_log_max: 1,
    };
  }

  const cpuArr     = pool.map(c => parseFloat(c.cpu_cores)          || 0);
  const ramArr     = pool.map(c => parseFloat(c.ram_gb)             || 0);
  const latArr     = pool.map(c => parseFloat(c.network_latency_ms) || 0);
  const bwArr      = pool.map(c => parseFloat(c.bandwidth_mbps)     || 0);
  const dsLogArr   = pool.map(c => Math.log1p(Math.max(0, parseFloat(c.dataset_size) || 0)));

  return {
    cpu_min:    Math.min(...cpuArr),   cpu_max:    Math.max(...cpuArr),
    ram_min:    Math.min(...ramArr),   ram_max:    Math.max(...ramArr),
    latency_min: Math.min(...latArr), latency_max: Math.max(...latArr),
    bw_min:     Math.min(...bwArr),   bw_max:     Math.max(...bwArr),
    ds_log_min: Math.min(...dsLogArr), ds_log_max: Math.max(...dsLogArr),
  };
}

// ── Individual factor scorers ─────────────────────────────────────────────────

/**
 * Reliability — Laplace smoothing over round history.
 * Cold start (0 rounds): (0+1)/(0+2) = 0.5.
 */
function computeReliability(client) {
  const succ  = parseInt(client.successful_rounds || client.successful_task_count || 0, 10);
  const total = parseInt(client.total_rounds ||
    (parseInt(client.successful_task_count || 0, 10) + parseInt(client.failure_count || 0, 10)), 10);
  return clamp((succ + 1) / (total + 2));
}

/**
 * Dataset size — log(1+n) min-max normalised across pool.
 */
function computeDatasetSize(client, stats) {
  const n      = Math.max(0, parseFloat(client.dataset_size) || 0);
  const logVal = Math.log1p(n);
  return minMax(logVal, stats.ds_log_min, stats.ds_log_max);
}

/**
 * Data quality — raw field, clamped [0,1].
 */
function computeDataQuality(client) {
  return clamp(parseFloat(client.data_quality || client.data_quality_score || 0));
}

/**
 * Compute — 0.6×mm(cpu) + 0.4×mm(ram), each min-max across active pool.
 */
function computeCompute(client, stats) {
  const cpu = parseFloat(client.cpu_cores) || 0;
  const ram = parseFloat(client.ram_gb)    || 0;
  const cpuScore = minMax(cpu, stats.cpu_min, stats.cpu_max);
  const ramScore = minMax(ram, stats.ram_min, stats.ram_max);
  return clamp(0.6 * cpuScore + 0.4 * ramScore);
}

/**
 * Network — 1 - mm(latency), blended with bandwidth if present.
 * If bandwidth_mbps is available: network = 0.6×(1-mm_lat) + 0.4×mm_bw.
 */
function computeNetwork(client, stats) {
  const lat  = parseFloat(client.network_latency_ms || client.network_latency || 0);
  const bw   = parseFloat(client.bandwidth_mbps)    || null;

  const latScore = 1 - minMax(lat, stats.latency_min, stats.latency_max);

  if (bw !== null && stats.bw_max > stats.bw_min) {
    const bwScore = minMax(bw, stats.bw_min, stats.bw_max);
    return clamp(0.6 * latScore + 0.4 * bwScore);
  }
  return clamp(latScore);
}

// ── Primary API ───────────────────────────────────────────────────────────────

/**
 * getScore — score a single client against the active pool.
 *
 * @param {Object}   client  — fl_clients row
 * @param {Object[]} pool    — all active fl_clients (for normalisation)
 * @param {Object}   weights — override DEFAULT_WEIGHTS (must sum to 1)
 * @returns {{ client_id, breakdown, total, rank(undef) }}
 */
function getScore(client, pool, weights = DEFAULT_WEIGHTS) {
  validateWeights(weights);
  const stats = computePoolStats(pool);

  const reliability  = computeReliability(client);
  const dataset_size = computeDatasetSize(client, stats);
  const data_quality = computeDataQuality(client);
  const compute      = computeCompute(client, stats);
  const network      = computeNetwork(client, stats);

  const total = clamp(
    weights.reliability  * reliability  +
    weights.dataset_size * dataset_size +
    weights.data_quality * data_quality +
    weights.compute      * compute      +
    weights.network      * network
  );

  return {
    client_id:  client.client_id || client.id,
    breakdown: {
      reliability:  parseFloat(reliability.toFixed(4)),
      dataset_size: parseFloat(dataset_size.toFixed(4)),
      data_quality: parseFloat(data_quality.toFixed(4)),
      compute:      parseFloat(compute.toFixed(4)),
      network:      parseFloat(network.toFixed(4)),
    },
    total: parseFloat(total.toFixed(4)),
    _client: client,
  };
}

/**
 * scoreAllClients — score a list, attach rank, sort DESC by total.
 * The pool for normalisation is the same list (or a separately provided active pool).
 *
 * @param {Object[]} clients  — clients to score
 * @param {Object}   weights  — optional weight override
 * @param {Object[]} pool     — active pool for normalisation (defaults to clients)
 * @returns {Object[]}        — sorted by total DESC, with rank attached
 */
function scoreAllClients(clients, weights = DEFAULT_WEIGHTS, pool = null) {
  validateWeights(weights);
  const normPool = pool || clients;
  const stats    = computePoolStats(normPool);

  const scored = clients.map(c => {
    const reliability  = computeReliability(c);
    const dataset_size = computeDatasetSize(c, stats);
    const data_quality = computeDataQuality(c);
    const compute      = computeCompute(c, stats);
    const network      = computeNetwork(c, stats);

    const total = clamp(
      weights.reliability  * reliability  +
      weights.dataset_size * dataset_size +
      weights.data_quality * data_quality +
      weights.compute      * compute      +
      weights.network      * network
    );

    return {
      client_id: c.client_id || c.id,
      breakdown: {
        reliability:  parseFloat(reliability.toFixed(4)),
        dataset_size: parseFloat(dataset_size.toFixed(4)),
        data_quality: parseFloat(data_quality.toFixed(4)),
        compute:      parseFloat(compute.toFixed(4)),
        network:      parseFloat(network.toFixed(4)),
      },
      total:   parseFloat(total.toFixed(4)),
      _client: c,
    };
  });

  scored.sort((a, b) => b.total - a.total);
  scored.forEach((s, i) => { s.rank = i + 1; });
  return scored;
}

/**
 * isEligible — hard gate for round participation.
 * Status must be 'active' AND no active cooldown.
 */
function isEligible(client) {
  if ((client.status || '') !== 'active') return false;
  const cl = parseInt(client.cooldown_rounds_left || 0, 10);
  return cl <= 0;
}

module.exports = {
  DEFAULT_WEIGHTS,
  WEIGHT_TOLERANCE,
  validateWeights,
  computePoolStats,
  computeReliability,
  computeDatasetSize,
  computeDataQuality,
  computeCompute,
  computeNetwork,
  getScore,
  scoreAllClients,
  isEligible,
  minMax,
};
