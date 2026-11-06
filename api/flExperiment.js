/**
 * flExperiment.js — FL Experiment Runner (with Ablation)
 * ======================================================
 * Runs controlled FL experiments comparing strategies.
 * Supports custom weights and an ablation endpoint.
 *
 * REAL:   TaskQueue scheduling, Redis, PostgreSQL state, timing, heartbeats.
 * SIMULATED: Model accuracy (formula-based proxy).
 */

'use strict';

const { query } = require('./db');
const { createAndRunRound, syncRoundStatus, getRoundDetail } = require('./flRound');
const { refreshHeartbeats } = require('./simulatedClients');
const { DEFAULT_WEIGHTS } = require('./clientScoring');

// ── Experiment constants ────────────────────────────────────────────────────
const BASE_ACCURACY = 0.50;
const LAMBDA = 0.40;
const POLL_INTERVAL_MS = 500;
const ROUND_TIMEOUT_MS = 30000;
const MAX_ABLATION_RUNS = 500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * computeSimulatedAccuracy — proxy metric for model quality.
 */
function computeSimulatedAccuracy(roundNumber, selectedResults) {
  if (!selectedResults || selectedResults.length === 0) return BASE_ACCURACY;

  const roundQuality = selectedResults.reduce((sum, r) => {
    const dq = parseFloat(r.data_quality || r.data_quality_score || (r.breakdown?.data_quality) || 0.5);
    const rel = parseFloat(r.reliability || r.reliability_score || (r.breakdown?.reliability) || 0.5);
    return sum + (dq * rel);
  }, 0) / selectedResults.length;

  const acc = BASE_ACCURACY + (1 - BASE_ACCURACY) * (1 - Math.exp(-roundQuality * roundNumber * LAMBDA));
  return parseFloat(Math.min(acc, 0.999).toFixed(4));
}

/**
 * waitForRound — poll until all jobs finish or timeout.
 */
async function waitForRound(roundId, jobCount) {
  const start = Date.now();
  while (Date.now() - start < ROUND_TIMEOUT_MS) {
    const status = await syncRoundStatus(roundId);
    if (status && (status.status === 'done' || status.status === 'failed')) break;
    if (status) {
      const finished = status.jobs.filter(j => ['done', 'failed'].includes(j.status)).length;
      if (finished >= jobCount) break;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  const elapsed = Date.now() - start;
  const finalJobs = await query(
    `SELECT status FROM jobs WHERE name='fl_training' AND (payload->>'round_id') = $1`,
    [roundId]
  );

  return {
    timedOut: elapsed >= ROUND_TIMEOUT_MS,
    elapsed_ms: elapsed,
    successes: finalJobs.filter(j => j.status === 'done').length,
    failures: finalJobs.filter(j => j.status === 'failed').length,
    total_jobs: finalJobs.length,
  };
}

async function countRecoveryEvents(roundId) {
  const result = await query(
    `SELECT COUNT(*)::int AS cnt FROM jobs
     WHERE name = 'fl_training' AND (payload->>'round_id') = $1 AND error IS NOT NULL`,
    [roundId]
  );
  return result[0]?.cnt || 0;
}

/**
 * runStrategy — run N rounds with a given strategy + weights.
 */
async function runStrategy({ strategy, rounds = 5, k = 3, duration_ms = 600, fail_prob = 0.15, weights = DEFAULT_WEIGHTS, seed = null } = {}) {
  const roundsData = [];
  let runningAccuracy = BASE_ACCURACY;

  console.log(`\n[experiment] ═══════════════════════════════════════`);
  console.log(`[experiment] Starting ${strategy.toUpperCase()} strategy — ${rounds} rounds, K=${k}`);
  console.log(`[experiment] ═══════════════════════════════════════`);

  for (let r = 1; r <= rounds; r++) {
    console.log(`[experiment] [${strategy}] Round ${r}/${rounds}...`);
    await refreshHeartbeats();
    const roundStart = Date.now();

    const { round, selection, jobs } = await createAndRunRound({
      round_number: r, k, strategy, weights, duration_ms, fail_prob,
      seed: seed != null ? `${seed}-${strategy}-r${r}` : null,
    });

    const completion = await waitForRound(round.id, jobs.length);
    const roundElapsed = Date.now() - roundStart;

    const detail = await getRoundDetail(round.id);
    const selectedResults = (detail.selection_results || []).filter(r => r.selected);

    const roundAccuracy = computeSimulatedAccuracy(r, selectedResults);
    runningAccuracy = Math.max(runningAccuracy, roundAccuracy);
    const loss = parseFloat((1 - runningAccuracy).toFixed(4));

    const avgTotalScore = selectedResults.length
      ? selectedResults.reduce((s, r) => s + parseFloat(r.score || r.total_score || 0), 0) / selectedResults.length : 0;
    const avgReliability = selectedResults.length
      ? selectedResults.reduce((s, r) => {
        const bd = typeof r.breakdown === 'string' ? JSON.parse(r.breakdown) : (r.breakdown || {});
        return s + parseFloat(bd.reliability || r.reliability_score || 0);
      }, 0) / selectedResults.length : 0;

    const recoveryEvents = await countRecoveryEvents(round.id);

    roundsData.push({
      round_number: r, round_id: round.id, strategy,
      k_requested: k, k_selected: selection.k_selected,
      eligible_clients: selection.eligible_count, total_clients: selection.total_count,
      selected_clients: selection.selected.map(s => s.client_id),
      avg_selected_score: parseFloat(avgTotalScore.toFixed(4)),
      avg_selected_reliability: parseFloat(avgReliability.toFixed(4)),
      simulated_accuracy: roundAccuracy, cumulative_accuracy: runningAccuracy,
      simulated_loss: loss, round_time_ms: roundElapsed,
      job_successes: completion.successes, job_failures: completion.failures,
      recovery_events: recoveryEvents,
      task_success_rate: completion.total_jobs > 0
        ? parseFloat((completion.successes / completion.total_jobs).toFixed(4)) : 0,
      timed_out: completion.timedOut,
    });

    console.log(
      `[experiment] [${strategy}] R${r} done | acc=${roundAccuracy} | loss=${loss} | ` +
      `time=${roundElapsed}ms | success=${completion.successes}/${completion.total_jobs}`
    );
  }

  const summary = {
    strategy, total_rounds: rounds, k, weights_used: weights,
    final_accuracy: runningAccuracy,
    final_loss: parseFloat((1 - runningAccuracy).toFixed(4)),
    avg_round_time_ms: Math.round(roundsData.reduce((s, r) => s + r.round_time_ms, 0) / rounds),
    total_job_failures: roundsData.reduce((s, r) => s + r.job_failures, 0),
    total_recovery_events: roundsData.reduce((s, r) => s + r.recovery_events, 0),
    total_successful_tasks: roundsData.reduce((s, r) => s + r.job_successes, 0),
    avg_selected_score: parseFloat((roundsData.reduce((s, r) => s + r.avg_selected_score, 0) / rounds).toFixed(4)),
    avg_selected_reliability: parseFloat((roundsData.reduce((s, r) => s + r.avg_selected_reliability, 0) / rounds).toFixed(4)),
    avg_task_success_rate: parseFloat((roundsData.reduce((s, r) => s + r.task_success_rate, 0) / rounds).toFixed(4)),
  };

  return { strategy, rounds_data: roundsData, summary };
}

/**
 * runExperiment — top-level: run both strategies, return comparison.
 */
async function runExperiment({
  rounds = 5, k = 3, duration_ms = 600, fail_prob = 0.15,
  reset = true, weights = DEFAULT_WEIGHTS, seed = null,
} = {}) {
  const experimentId = `exp-${Date.now()}`;
  const startedAt = new Date();

  console.log(`\n[experiment] ╔═══════════════════════════════════════╗`);
  console.log(`[experiment] ║  FL EXPERIMENT STARTED                ║`);
  console.log(`[experiment] ╚═══════════════════════════════════════╝`);

  if (reset) {
    const { registerSimulatedClients } = require('./simulatedClients');
    await registerSimulatedClients();
  }

  const randomResult = await runStrategy({ strategy: 'random', rounds, k, duration_ms, fail_prob, weights, seed });
  await sleep(2000);
  const intelligentResult = await runStrategy({ strategy: 'intelligent', rounds, k, duration_ms, fail_prob, weights, seed });

  const completedAt = new Date();
  const intSum = intelligentResult.summary;
  const randSum = randomResult.summary;

  const comparison = {
    accuracy_improvement: parseFloat((intSum.final_accuracy - randSum.final_accuracy).toFixed(4)),
    loss_reduction: parseFloat((randSum.final_loss - intSum.final_loss).toFixed(4)),
    avg_time_diff_ms: intSum.avg_round_time_ms - randSum.avg_round_time_ms,
    reliability_improvement: parseFloat((intSum.avg_selected_reliability - randSum.avg_selected_reliability).toFixed(4)),
    score_improvement: parseFloat((intSum.avg_selected_score - randSum.avg_selected_score).toFixed(4)),
    failure_reduction: randSum.total_job_failures - intSum.total_job_failures,
    recovery_reduction: randSum.total_recovery_events - intSum.total_recovery_events,
    task_success_improvement: parseFloat((intSum.avg_task_success_rate - randSum.avg_task_success_rate).toFixed(4)),
  };

  return {
    experiment_id: experimentId, started_at: startedAt, completed_at: completedAt,
    elapsed_ms: completedAt - startedAt,
    config: { rounds, k, duration_ms, fail_prob, weights },
    intelligent: intelligentResult, random: randomResult, comparison,
  };
}
function assertAblationCap(configs, seeds, rounds) {
  const total = configs * seeds * rounds;
  if (total > MAX_ABLATION_RUNS)
    throw { code: 400, message: `Ablation capped at ${MAX_ABLATION_RUNS} runs (got ${total})` };
  return total;
}

async function runAblation({ weight_configs = [], seeds = [42], rounds = 5, k = 3, duration_ms = 600, fail_prob = 0.15, ablationId = null } = {}) {
  assertAblationCap(weight_configs.length, seeds.length, rounds);
  if (ablationId) {
    await query(`UPDATE fl_ablation_runs SET status = 'running' WHERE id = $1`, [ablationId]);
  }

  const results = [];

  try {
    for (const config of weight_configs) {
      for (const seed of seeds) {
        console.log(`[ablation] Running config="${config.name}" seed=${seed}`);
        await refreshHeartbeats();

        const expResult = await runExperiment({
          rounds, k, duration_ms, fail_prob,
          weights: config.weights, reset: false, seed,
        });

        results.push({
          config_name: config.name,
          weights: config.weights,
          seed,
          intelligent: expResult.intelligent.summary,
          random: expResult.random.summary,
          comparison: expResult.comparison,
        });
      }
    }

    // Compute mean ± std for each config
    const configGroups = {};
    for (const r of results) {
      if (!configGroups[r.config_name]) configGroups[r.config_name] = [];
      configGroups[r.config_name].push(r);
    }

    const summary = Object.entries(configGroups).map(([name, runs]) => {
      const metrics = ['final_accuracy', 'avg_round_time_ms', 'total_job_failures', 'avg_task_success_rate'];
      const row = { config_name: name, weights: runs[0].weights, n_seeds: runs.length };

      for (const m of metrics) {
        const vals = runs.map(r => r.intelligent[m] || 0);
        const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
        const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
        row[`intelligent_${m}_mean`] = parseFloat(mean.toFixed(4));
        row[`intelligent_${m}_std`] = parseFloat(std.toFixed(4));

        const rVals = runs.map(r => r.random[m] || 0);
        const rMean = rVals.reduce((s, v) => s + v, 0) / rVals.length;
        row[`random_${m}_mean`] = parseFloat(rMean.toFixed(4));
      }
      return row;
    });

    const output = { status: 'done', total_runs: totalRuns, results, summary };

    if (ablationId) {
      await query(
        `UPDATE fl_ablation_runs SET status = 'done', results = $1, completed_at = now() WHERE id = $2`,
        [JSON.stringify(output), ablationId]
      );
    }

    return output;
  } catch (err) {
    if (ablationId) {
      await query(
        `UPDATE fl_ablation_runs SET status = 'failed', error = $1, completed_at = now() WHERE id = $2`,
        [err.message || String(err), ablationId]
      );
    }
    throw err;
  }
}

module.exports = {
  runExperiment,
  runStrategy,
  runAblation,
  computeSimulatedAccuracy,
  BASE_ACCURACY,
  LAMBDA,
  MAX_ABLATION_RUNS,
  assertAblationCap,
};
