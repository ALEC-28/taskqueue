const { query } = require('./db');

/**
 * Register or update an FL client in the system.
 * Validates required client specifications and inserts/upserts into fl_clients table.
 */
async function registerClient(clientData) {
  const {
    client_id,
    name,
    cpu_capability,
    memory_capability,
    gpu_capability = null,
    network_latency = 0.0,
    data_quality_score = 1.0,
    reliability_score = 1.0,
    status = 'available',
  } = clientData;

  // Validation
  if (!client_id || typeof client_id !== 'string' || !client_id.trim()) {
    throw new Error('client_id is required');
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('name is required');
  }
  if (!cpu_capability || typeof cpu_capability !== 'object') {
    throw new Error('cpu_capability is required and must be an object');
  }
  if (!memory_capability || typeof memory_capability !== 'object') {
    throw new Error('memory_capability is required and must be an object');
  }

  const validStatuses = ['available', 'busy', 'unhealthy', 'offline'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}. Must be one of ${validStatuses.join(', ')}`);
  }

  const sql = `
    INSERT INTO fl_clients (
      client_id, name, cpu_capability, memory_capability, gpu_capability,
      network_latency, data_quality_score, reliability_score, status, last_heartbeat
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
    ON CONFLICT (client_id) DO UPDATE SET
      name = EXCLUDED.name,
      cpu_capability = EXCLUDED.cpu_capability,
      memory_capability = EXCLUDED.memory_capability,
      gpu_capability = EXCLUDED.gpu_capability,
      network_latency = EXCLUDED.network_latency,
      data_quality_score = EXCLUDED.data_quality_score,
      reliability_score = EXCLUDED.reliability_score,
      status = EXCLUDED.status,
      last_heartbeat = now()
    RETURNING *;
  `;

  const params = [
    client_id.trim(),
    name.trim(),
    JSON.stringify(cpu_capability),
    JSON.stringify(memory_capability),
    gpu_capability ? JSON.stringify(gpu_capability) : null,
    network_latency,
    data_quality_score,
    reliability_score,
    status,
  ];

  const [client] = await query(sql, params);
  return client;
}

/**
 * Retrieve all registered FL clients, optionally filtered by status.
 */
async function getClients(filters = {}) {
  const { status } = filters;
  let sql = `SELECT * FROM fl_clients WHERE 1=1`;
  const params = [];

  if (status) {
    params.push(status);
    sql += ` AND status = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC`;

  return await query(sql, params);
}

/**
 * Send heartbeat for an FL client and optionally update its status.
 */
async function updateHeartbeat(clientId, status = null) {
  if (!clientId || typeof clientId !== 'string' || !clientId.trim()) {
    throw new Error('client_id is required');
  }

  const validStatuses = ['available', 'busy', 'unhealthy', 'offline'];
  if (status && !validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}. Must be one of ${validStatuses.join(', ')}`);
  }

  let sql;
  let params;

  if (status) {
    sql = `
      UPDATE fl_clients
      SET last_heartbeat = now(), status = $2
      WHERE client_id = $1
      RETURNING *;
    `;
    params = [clientId.trim(), status];
  } else {
    sql = `
      UPDATE fl_clients
      SET last_heartbeat = now()
      WHERE client_id = $1
      RETURNING *;
    `;
    params = [clientId.trim()];
  }

  const [client] = await query(sql, params);
  if (!client) {
    throw new Error(`Client with client_id '${clientId}' not found`);
  }
  return client;
}

/**
 * Detect FL clients whose last_heartbeat exceeds the stale threshold and mark them offline.
 */
async function detectStaleClients(staleThresholdSeconds = 30) {
  const sql = `
    UPDATE fl_clients
    SET status = 'offline'
    WHERE last_heartbeat < now() - ($1 || ' seconds')::interval
      AND status != 'offline'
    RETURNING *;
  `;
  return await query(sql, [staleThresholdSeconds]);
}

/**
 * Update client status and execution statistics (failure count, success count).
 */
async function updateClientStatusAndStats(clientId, { status = null, incrementFailure = false, incrementSuccess = false } = {}) {
  if (!clientId) return null;

  const validStatuses = ['available', 'busy', 'unhealthy', 'offline'];
  if (status && !validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}. Must be one of ${validStatuses.join(', ')}`);
  }

  const sql = `
    UPDATE fl_clients
    SET status = COALESCE($2, status),
        failure_count = failure_count + (CASE WHEN $3::boolean THEN 1 ELSE 0 END),
        successful_task_count = successful_task_count + (CASE WHEN $4::boolean THEN 1 ELSE 0 END)
    WHERE client_id = $1
    RETURNING *;
  `;

  const [client] = await query(sql, [clientId, status, incrementFailure, incrementSuccess]);
  return client;
}

/**
 * Find an available healthy replacement FL client excluding specified client IDs.
 * Checks for status = 'available', active heartbeat, and optional hardware requirements.
 */
async function findReplacementClient(excludeClientId = null, requirements = {}) {
  let sql = `
    SELECT * FROM fl_clients
    WHERE status = 'available'
      AND last_heartbeat >= now() - interval '30 seconds'
  `;
  const params = [];

  if (excludeClientId) {
    params.push(excludeClientId);
    sql += ` AND client_id != $${params.length}`;
  }

  sql += ` ORDER BY last_heartbeat DESC`;

  const candidates = await query(sql, params);

  if (!candidates || candidates.length === 0) {
    return null;
  }

  // Filter candidates based on optional hardware requirements
  for (const candidate of candidates) {
    let satisfies = true;
    if (requirements.min_cpu_cores) {
      const cpu = typeof candidate.cpu_capability === 'string'
        ? JSON.parse(candidate.cpu_capability)
        : (candidate.cpu_capability || {});
      if ((cpu.cores || 0) < requirements.min_cpu_cores) satisfies = false;
    }
    if (requirements.min_ram_gb) {
      const mem = typeof candidate.memory_capability === 'string'
        ? JSON.parse(candidate.memory_capability)
        : (candidate.memory_capability || {});
      if ((mem.ram_gb || 0) < requirements.min_ram_gb) satisfies = false;
    }
    if (satisfies) {
      return candidate;
    }
  }

  return null;
}

module.exports = {
  registerClient,
  getClients,
  updateHeartbeat,
  detectStaleClients,
  updateClientStatusAndStats,
  findReplacementClient,
};


