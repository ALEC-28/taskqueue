/**
 * simulatedClients.js — FL Heterogeneous Client Simulator
 * ========================================================
 * Reads clients from fl_clients (any source). The 10 default clients are
 * a convenience seed function; they are NOT hardcoded into selection logic.
 *
 * Failure behaviour per client is driven by metadata:
 *   { dropout_prob, slowdown_factor }
 * Defaults derive from reliability_prior and latency.
 *
 * Updated for new schema:
 *   - status uses 'active' (not 'available')
 *   - cpu_cores/ram_gb are flat columns (not JSONB)
 *   - dataset_size, data_quality, total_rounds, successful_rounds columns
 *   - source = 'simulated'
 */

'use strict';

const { query } = require('./db');

// ── 10 default client definitions (used by POST /fl/setup-clients) ────────────
const SIMULATED_CLIENTS = [
  {
    client_id:  'fl-sim-c1',  name: 'SIM Hospital Node C1 (High-Tier)',
    cpu_cores: 16, ram_gb: 32, network_latency_ms: 20, bandwidth_mbps: 800,
    dataset_size: 8000, data_quality: 0.90, reliability_prior: 0.95,
    _seed_successes: 95, _seed_failures: 5,
    metadata: { dropout_prob: 0.03, slowdown_factor: 1.0 },
  },
  {
    client_id:  'fl-sim-c2',  name: 'SIM Hospital Node C2 (Medium-High)',
    cpu_cores: 8, ram_gb: 16, network_latency_ms: 60, bandwidth_mbps: 400,
    dataset_size: 5000, data_quality: 0.85, reliability_prior: 0.80,
    _seed_successes: 80, _seed_failures: 20,
    metadata: { dropout_prob: 0.08, slowdown_factor: 1.3 },
  },
  {
    client_id:  'fl-sim-c3',  name: 'SIM Clinic Node C3 (Medium-Low)',
    cpu_cores: 4, ram_gb: 8, network_latency_ms: 120, bandwidth_mbps: 200,
    dataset_size: 2000, data_quality: 0.70, reliability_prior: 0.65,
    _seed_successes: 65, _seed_failures: 35,
    metadata: { dropout_prob: 0.15, slowdown_factor: 1.8 },
  },
  {
    client_id:  'fl-sim-c4',  name: 'SIM Hospital Node C4 (High-Tier Reliable)',
    cpu_cores: 16, ram_gb: 32, network_latency_ms: 15, bandwidth_mbps: 1000,
    dataset_size: 9000, data_quality: 0.75, reliability_prior: 0.98,
    _seed_successes: 98, _seed_failures: 2,
    metadata: { dropout_prob: 0.02, slowdown_factor: 1.0 },
  },
  {
    client_id:  'fl-sim-c5',  name: 'SIM Remote Node C5 (Low-Tier)',
    cpu_cores: 2, ram_gb: 4, network_latency_ms: 250, bandwidth_mbps: 50,
    dataset_size: 500, data_quality: 0.55, reliability_prior: 0.50,
    _seed_successes: 50, _seed_failures: 50,
    metadata: { dropout_prob: 0.25, slowdown_factor: 3.0 },
  },
  {
    client_id:  'fl-sim-c6',  name: 'SIM Clinic Node C6 (Medium)',
    cpu_cores: 8, ram_gb: 16, network_latency_ms: 80, bandwidth_mbps: 350,
    dataset_size: 3000, data_quality: 0.80, reliability_prior: 0.75,
    _seed_successes: 75, _seed_failures: 25,
    metadata: { dropout_prob: 0.10, slowdown_factor: 1.5 },
  },
  {
    client_id:  'fl-sim-c7',  name: 'SIM Hospital Node C7 (High-Reliable)',
    cpu_cores: 12, ram_gb: 24, network_latency_ms: 40, bandwidth_mbps: 600,
    dataset_size: 6000, data_quality: 0.88, reliability_prior: 0.90,
    _seed_successes: 90, _seed_failures: 10,
    metadata: { dropout_prob: 0.05, slowdown_factor: 1.1 },
  },
  {
    client_id:  'fl-sim-c8',  name: 'SIM Remote Node C8 (Low-Tier Unreliable)',
    cpu_cores: 4, ram_gb: 8, network_latency_ms: 180, bandwidth_mbps: 80,
    dataset_size: 800, data_quality: 0.65, reliability_prior: 0.60,
    _seed_successes: 60, _seed_failures: 40,
    metadata: { dropout_prob: 0.20, slowdown_factor: 2.5 },
  },
  {
    client_id:  'fl-sim-c9',  name: 'SIM Clinic Node C9 (Medium-High)',
    cpu_cores: 8, ram_gb: 16, network_latency_ms: 50, bandwidth_mbps: 450,
    dataset_size: 4500, data_quality: 0.78, reliability_prior: 0.85,
    _seed_successes: 85, _seed_failures: 15,
    metadata: { dropout_prob: 0.07, slowdown_factor: 1.2 },
  },
  {
    client_id:  'fl-sim-c10', name: 'SIM Remote Node C10 (Very Low-Tier)',
    cpu_cores: 2, ram_gb: 4, network_latency_ms: 300, bandwidth_mbps: 20,
    dataset_size: 300, data_quality: 0.50, reliability_prior: 0.45,
    _seed_successes: 45, _seed_failures: 55,
    metadata: { dropout_prob: 0.30, slowdown_factor: 4.0 },
  },
];

/**
 * registerSimulatedClients — upsert all 10 default simulated clients.
 * Safe to call multiple times.
 */
async function registerSimulatedClients() {
  const registered = [];

  for (const def of SIMULATED_CLIENTS) {
    const { _seed_successes, _seed_failures, metadata, ...clientData } = def;
    const totalRounds      = _seed_successes + _seed_failures;
    const successfulRounds = _seed_successes;

    await query(
      `INSERT INTO fl_clients
         (client_id, name, status, cpu_cores, ram_gb, network_latency_ms, bandwidth_mbps,
          dataset_size, data_quality, reliability_prior, total_rounds, successful_rounds,
          failure_count, consecutive_failures, cooldown_rounds_left, source, metadata)
       VALUES ($1,$2,'active',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,0,'simulated',$13)
       ON CONFLICT (client_id) DO UPDATE SET
         name = EXCLUDED.name, status = 'active',
         cpu_cores = EXCLUDED.cpu_cores, ram_gb = EXCLUDED.ram_gb,
         network_latency_ms = EXCLUDED.network_latency_ms,
         bandwidth_mbps = EXCLUDED.bandwidth_mbps,
         dataset_size = EXCLUDED.dataset_size,
         data_quality = EXCLUDED.data_quality,
         reliability_prior = EXCLUDED.reliability_prior,
         total_rounds = EXCLUDED.total_rounds,
         successful_rounds = EXCLUDED.successful_rounds,
         failure_count = EXCLUDED.failure_count,
         consecutive_failures = 0, cooldown_rounds_left = 0,
         source = 'simulated',
         metadata = EXCLUDED.metadata,
         updated_at = now()`,
      [
        clientData.client_id, clientData.name,
        clientData.cpu_cores, clientData.ram_gb,
        clientData.network_latency_ms, clientData.bandwidth_mbps,
        clientData.dataset_size, clientData.data_quality, clientData.reliability_prior,
        totalRounds, successfulRounds, _seed_failures,
        JSON.stringify(metadata),
      ]
    );

    registered.push({ client_id: clientData.client_id, name: clientData.name });

    console.log(
      `[sim] registered ${clientData.client_id} | ` +
      `cores=${clientData.cpu_cores} | ram=${clientData.ram_gb}GB | ` +
      `latency=${clientData.network_latency_ms}ms | ` +
      `reliability=${((successfulRounds / totalRounds) * 100).toFixed(0)}%`
    );
  }

  console.log(`[sim] ${registered.length} simulated clients registered.`);
  return registered;
}

/**
 * clearSimulatedClients — remove all simulated clients.
 */
async function clearSimulatedClients() {
  const deleted = await query(
    `DELETE FROM fl_clients WHERE source = 'simulated' RETURNING client_id`
  );
  console.log(`[sim] cleared ${deleted.length} simulated clients`);
  return deleted;
}

/**
 * refreshHeartbeats — set all simulated clients to active status.
 */
async function refreshHeartbeats() {
  await query(
    `UPDATE fl_clients SET status = 'active', consecutive_failures = 0, cooldown_rounds_left = 0
     WHERE source = 'simulated'`
  );
}

/**
 * getClientBehaviour — return dropout_prob and slowdown_factor for a client.
 * Reads from metadata; derives defaults from reliability_prior and latency.
 */
function getClientBehaviour(client) {
  const meta = client.metadata || {};
  return {
    dropout_prob:    meta.dropout_prob    ?? (1 - (parseFloat(client.reliability_prior) || 0.7)) * 0.5,
    slowdown_factor: meta.slowdown_factor ?? (1 + (parseFloat(client.network_latency_ms) || 100) / 300),
  };
}

module.exports = {
  SIMULATED_CLIENTS,
  registerSimulatedClients,
  clearSimulatedClients,
  refreshHeartbeats,
  getClientBehaviour,
};
